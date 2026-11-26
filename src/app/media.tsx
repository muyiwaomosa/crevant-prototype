import clsx from "clsx";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Clapperboard, ImagePlus, ImageOff, RefreshCw, X } from "lucide-react";
import { Card, Modal, buttonClass } from "../components/ui";
import { Message, Spinner } from "../public/auth/AuthUi";
import {
  AppApiError,
  LIMITS,
  messageFor,
  type MediaStatus,
  type PhotoLinks,
  type Post,
} from "./api";
import { useAppApi } from "./AppApiContext";
import { ErrorNote, When } from "./components";
import { preparePhoto } from "./photoPrep";
import { TopicSelect, useTopicList } from "./content";
import {
  VIDEO_ACCEPT,
  VideoProgress,
  busyStage,
  useVideoJob,
  useVideoStatus,
} from "./video";

/**
 * Photo posts (Build 5.3).
 *
 * The browser only resizes: it sends a JPEG of at most 1600 px to the
 * post-media Edge Function, which checks the member with the database,
 * decodes it, and stores two fresh copies (1600 px and an 800 px feed copy)
 * privately. Posts show the feed copy through signed links (an hour), fetched
 * in batches and refetched when one fails; the full photo opens on request.
 * Photo posting appears only while the founder has it switched on.
 */

export const DESCRIPTION_MAX = 250;

// ---------------------------------------------------------------------------
// Whether photos are on, and the link cache.

type Entry = {
  state: "loading" | "ok" | "none";
  links: PhotoLinks | null;
  until: number;
  refetched: boolean;
};
type Store = {
  get(id: string): Entry | undefined;
  request(id: string): void;
  failed(id: string): void;
  retry(id: string): void;
  version: number;
};
const PhotoContext = createContext<{ enabled: boolean; store: Store | null }>({
  enabled: false,
  store: null,
});
const LINK_MS = 50 * 60_000;
const MISS_MS = 60_000;

/** Loads whether photo posting is on, and caches photo links. Never blocks the app. */
export function MediaProvider({ children }: { children: ReactNode }) {
  const api = useAppApi();
  const [enabled, setEnabled] = useState(false);
  const cache = useRef(new Map<string, Entry>());
  const queue = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api.photoStatus().then(
      (on) => live && setEnabled(on),
      () => live && setEnabled(false),
    );
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [api]);
  const flush = useCallback(async () => {
    timer.current = null;
    const ids = [...queue.current];
    queue.current.clear();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      let links: Record<string, PhotoLinks> = {};
      try {
        links = await api.photoLinks(chunk);
      } catch {
        links = {};
      }
      const now = Date.now();
      for (const id of chunk) {
        const prev = cache.current.get(id);
        const refetched = prev?.refetched ?? false;
        cache.current.set(
          id,
          links[id]
            ? { state: "ok", links: links[id], until: now + LINK_MS, refetched }
            : { state: "none", links: null, until: now + MISS_MS, refetched },
        );
      }
    }
    setVersion((v) => v + 1);
  }, [api]);
  const request = useCallback(
    (id: string) => {
      const hit = cache.current.get(id);
      if (hit && (hit.state === "loading" || hit.until > Date.now())) return;
      cache.current.set(id, {
        state: "loading",
        links: null,
        until: 0,
        refetched: hit?.refetched ?? false,
      });
      queue.current.add(id);
      if (!timer.current) timer.current = setTimeout(() => void flush(), 25);
    },
    [flush],
  );
  // An image failed (an expired or deleted link): fetch a fresh link, once.
  const failed = useCallback(
    (id: string) => {
      const hit = cache.current.get(id);
      if (hit?.state === "loading") return;
      if (hit?.refetched && hit.state === "ok") {
        // A fresh link failed too: show "couldn't load" (Try again asks once more).
        cache.current.set(id, {
          state: "none",
          links: null,
          until: Date.now() + MISS_MS,
          refetched: false,
        });
        setVersion((v) => v + 1);
        return;
      }
      cache.current.set(id, {
        state: "none",
        links: null,
        until: 0,
        refetched: true,
      });
      request(id);
      setVersion((v) => v + 1);
    },
    [request],
  );
  // The member asked to try again: a fresh fetch, and a later failure may refetch once more.
  const retry = useCallback(
    (id: string) => {
      cache.current.set(id, {
        state: "none",
        links: null,
        until: 0,
        refetched: false,
      });
      request(id);
      setVersion((v) => v + 1);
    },
    [request],
  );
  const store: Store = {
    get: (id) => cache.current.get(id),
    request,
    failed,
    retry,
    version,
  };
  return (
    <PhotoContext.Provider value={{ enabled, store }}>
      {children}
    </PhotoContext.Provider>
  );
}

export function usePhotosEnabled(): boolean {
  return useContext(PhotoContext).enabled;
}

/** Links for one post's photo: undefined while loading, null if there are none (or they failed). */
function usePhotoLinks(postId: string): {
  links: PhotoLinks | null | undefined;
  retry: () => void;
  failed: () => void;
} {
  const { store } = useContext(PhotoContext);
  useEffect(() => {
    store?.request(postId);
  }, [store, postId]);
  const e = store?.get(postId);
  return {
    links:
      !e || e.state === "loading"
        ? undefined
        : e.state === "ok"
          ? e.links
          : null,
    retry: () => store?.retry(postId),
    failed: () => store?.failed(postId),
  };
}

// ---------------------------------------------------------------------------
// A post's photo, and the larger view.

export function PostPhoto({ post, bleed = false }: { post: Post; bleed?: boolean }) {
  const media = post.media;
  const { links, retry, failed } = usePhotoLinks(post.id);
  const [open, setOpen] = useState(false);
  if (!media) return null;
  const alt = media.description ?? `Photo by ${post.author.displayName}`;
  // Tall photos are shown at 4:5 in the feed (the whole photo opens on tap).
  const ratio = Math.max(media.width / media.height, 4 / 5);
  return (
    <div className={bleed ? undefined : "mt-3"}>
      <div
        className={`relative w-full overflow-hidden bg-ink-100 ${bleed ? "" : "rounded-2xl"}`}
        style={{ aspectRatio: String(ratio) }}
        data-testid="post-photo"
      >
        {links === undefined && (
          <div
            className="absolute inset-0 animate-pulse bg-ink-100"
            aria-hidden="true"
          />
        )}
        {links === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-ink-600">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <p>This photo couldn't load.</p>
            <button
              type="button"
              onClick={retry}
              className={buttonClass("secondary", "sm")}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        )}
        {links && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open the photo: ${alt}`}
            className="absolute inset-0 block focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
          >
            <img
              src={links.feed}
              alt={alt}
              loading="lazy"
              decoding="async"
              onError={failed}
              className="h-full w-full object-cover"
              width={media.width}
              height={media.height}
            />
          </button>
        )}
      </div>
      <Modal
        open={open && Boolean(links)}
        onClose={() => setOpen(false)}
        title="Photo"
      >
        {links && (
          <figure className="space-y-2">
            <img
              src={links.full}
              alt={alt}
              onError={failed}
              className="max-h-[75vh] w-full rounded-xl bg-ink-100 object-contain"
              width={media.width}
              height={media.height}
            />
          </figure>
        )}
      </Modal>
    </div>
  );
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16),
      );

// ---------------------------------------------------------------------------
// The post composer: text as before, plus one optional photo when photos are on.

export type NewPost = {
  text: string;
  requestId: string;
  photo?: { uploadId: string; description: string };
  /** Video posts (20261213000000): a video the server has checked. */
  video?: { uploadId: string };
  /** Content (20261202000000): an optional topic from the approved list. */
  topic?: string;
};

export function PostComposer({
  label,
  placeholder,
  rows = 3,
  onPost,
}: {
  label: string;
  placeholder: string;
  rows?: number;
  /** Returns once the post is stored. requestId stays the same for a retry of the same post. */
  onPost: (post: NewPost) => Promise<void>;
}) {
  // One composer whatever the switch says, so text typed while the status
  // loads is never lost; Add photo appears only while photos are on. Without a
  // photo it posts exactly as the text composer does (same rules, same request ids).
  const enabled = usePhotosEnabled();
  const videoEnabled = useVideoStatus()?.enabled === true;
  return (
    <PhotoComposer
      label={label}
      placeholder={placeholder}
      rows={rows}
      onPost={onPost}
      photosEnabled={enabled}
      videoEnabled={videoEnabled}
    />
  );
}

function PhotoComposer({
  label,
  placeholder,
  rows,
  onPost,
  photosEnabled,
  videoEnabled,
}: {
  label: string;
  placeholder: string;
  rows: number;
  onPost: (post: NewPost) => Promise<void>;
  photosEnabled: boolean;
  videoEnabled: boolean;
}) {
  const api = useAppApi();
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  // Video posts (20261213000000): one video, prepared and uploaded as soon as it is chosen.
  const videoRef = useRef<HTMLInputElement>(null);
  const video = useVideoJob("post");
  const withVideo = video.job.stage !== "idle";
  const videoReady = video.job.stage === "done" && video.job.result !== null;
  const [text, setText] = useState("");
  const topics = useTopicList();
  const [topic, setTopic] = useState("");
  const [photo, setPhoto] = useState<{
    blob: Blob;
    preview: string;
    width: number;
    height: number;
  } | null>(null);
  const [stage, setStage] = useState<
    "idle" | "reading" | "uploading" | "posting"
  >("idle");
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  // The stored upload for the current photo: reused on retry, so it is uploaded once.
  const uploaded = useRef<string | null>(null);
  // One request id per post (text + photo): reused on retry, new once it changes or succeeds.
  const request = useRef<{ key: string; id: string } | null>(null);
  const length = [...text.trim()].length;
  const over = length > LIMITS.post;
  const busy = stage !== "idle";
  const videoBusy = busyStage(video.job.stage);
  const cannotPost =
    busy ||
    over ||
    videoBusy ||
    (withVideo && !videoReady) ||
    (length === 0 && !photo && !videoReady);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("reading");
    try {
      const next = await preparePhoto(file);
      setPhoto(next);
      uploaded.current = null;
    } catch (e) {
      setError(e);
    } finally {
      setStage("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // The caption is kept when the photo is changed or removed.
  function removePhoto() {
    setPhoto(null);
    uploaded.current = null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current || cannotPost) return;
    sending.current = true;
    setError(null);
    try {
      let photoPart: NewPost["photo"];
      if (photo) {
        if (!uploaded.current) {
          setStage("uploading");
          uploaded.current = (await api.uploadPhoto(photo.blob)).uploadId;
        }
        // No description is asked for: the photo's alt text falls back to "Photo by <name>".
        photoPart = { uploadId: uploaded.current, description: "" };
      }
      const videoPart: NewPost["video"] =
        videoReady && video.job.result
          ? { uploadId: video.job.result.uploadId }
          : undefined;
      const key = `${text}\u0000${photoPart?.uploadId ?? ""}\u0000${photoPart?.description ?? ""}\u0000${videoPart?.uploadId ?? ""}`;
      if (!request.current || request.current.key !== key)
        request.current = { key, id: newRequestId() };
      setStage("posting");
      await onPost({
        text,
        requestId: request.current.id,
        photo: photoPart,
        video: videoPart,
        topic: topic || undefined,
      });
      request.current = null;
      uploaded.current = null;
      setText("");
      setTopic("");
      setPhoto(null);
      video.reset();
    } catch (err) {
      // An expired or unusable upload can't be retried: the photo is sent again next time.
      if (
        err instanceof AppApiError &&
        ["upload_expired", "upload_not_ready"].includes(err.code)
      ) {
        uploaded.current = null;
        // A video can't be reused either: it is added again.
        if (videoReady) video.reset();
      }
      setError(err);
    } finally {
      sending.current = false;
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {photosEnabled && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void choose(e.target.files?.[0])}
          data-testid="photo-input"
        />
      )}
      {videoEnabled && (
        <input
          ref={videoRef}
          type="file"
          accept={VIDEO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void video.start(f);
            e.target.value = "";
          }}
          data-testid="video-input"
        />
      )}
      {withVideo && (
        <VideoProgress
          job={video.job}
          onCancel={video.cancel}
          onRemove={video.reset}
        />
      )}
      {/* With a photo: the preview first, then its controls, then the one
          caption field. The caption field below stays the same element
          either way, so nothing typed is lost when a photo is added. */}
      {photo && (
        <div className="space-y-2" data-testid="photo-attachment">
          <div className="overflow-hidden rounded-2xl bg-ink-100">
            <img
              src={photo.preview}
              alt="The photo you're adding"
              className="max-h-80 w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className={clsx(buttonClass("secondary", "sm"), "h-11")}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" /> Change photo
            </button>
            <button
              type="button"
              onClick={removePhoto}
              disabled={busy}
              className={clsx(buttonClass("secondary", "sm"), "h-11")}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Remove photo
            </button>
          </div>
        </div>
      )}
      {(photo || withVideo) && (
        <p className="text-[13px] leading-snug text-ink-500" data-testid="media-backup-note">
          Keep your original. During the pilot, Splitpost does not keep a separate backup of photos and videos.
        </p>
      )}
      <label htmlFor={textId} className="sr-only">
        {label}
      </label>
      <textarea
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        placeholder={
          photo || withVideo ? "Add a caption (optional)" : placeholder
        }
        className="block w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {photosEnabled && !photo && !withVideo && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className={buttonClass("secondary", "sm")}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" /> Add photo
            </button>
          )}
          {videoEnabled && !photo && !withVideo && (
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              disabled={busy}
              className={buttonClass("secondary", "sm")}
            >
              <Clapperboard className="h-4 w-4" aria-hidden="true" /> Add video
            </button>
          )}
          {topics && topics.length > 0 && (
            <TopicSelect value={topic} onChange={setTopic} topics={topics} />
          )}
          <span
            className={clsx(
              "text-[13px] tabular-nums",
              over ? "font-semibold text-[#b4233a]" : "text-ink-500",
            )}
            aria-live="polite"
          >
            {length}/{LIMITS.post}
          </span>
        </div>
        <button
          type="submit"
          disabled={cannotPost}
          className={buttonClass("primary", "sm")}
        >
          {stage === "uploading"
            ? "Uploading photo…"
            : stage === "posting"
              ? "Sending…"
              : "Post"}
        </button>
      </div>
      {stage === "reading" && <Spinner label="Preparing your photo…" />}
      {stage === "uploading" && (
        <p role="status" className="text-sm text-ink-600">
          Uploading your photo…
        </p>
      )}
      {error !== null && <ErrorNote error={error} />}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Moderators: the reported photo, and photo storage.

export function ReportPhoto({ reportId }: { reportId: string }) {
  const api = useAppApi();
  const [photo, setPhoto] = useState<
    (PhotoLinks & { description: string | null }) | null | undefined
  >(undefined);
  useEffect(() => {
    let live = true;
    api.modReportPhoto(reportId).then(
      (p) => live && setPhoto(p),
      () => live && setPhoto(null),
    );
    return () => {
      live = false;
    };
  }, [api, reportId]);
  if (!photo) return null;
  return (
    <figure className="mt-2 space-y-1">
      <img
        src={photo.full}
        alt={photo.description ?? "The reported photo"}
        className="max-h-96 w-full rounded-xl bg-ink-100 object-contain"
      />
      <figcaption className="text-[13px] text-ink-500">
        The reported photo{photo.description ? `: ${photo.description}` : ""}.
        Kept as evidence while this report is kept.
      </figcaption>
    </figure>
  );
}

const mb = (n: number | null) =>
  n === null ? "not set" : `${(n / 1_048_576).toFixed(1)} MB`;

export function PhotoStoragePanel({ founder }: { founder: boolean }) {
  const api = useAppApi();
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"drain" | "check" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [checks, setChecks] = useState<Array<{ ms: number; ok: boolean }>>([]);
  const load = useCallback(async () => {
    try {
      setStatus(await api.mediaStatus());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function drainNow() {
    setBusy("drain");
    setDone(null);
    setError(null);
    try {
      const r = await api.modMediaDrain();
      setDone(
        r.failed > 0
          ? `${r.deleted} deleted; ${r.failed} couldn't be deleted and will be retried.`
          : `${r.deleted} deleted.`,
      );
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }
  async function runChecks() {
    setBusy("check");
    setDone(null);
    setError(null);
    setChecks([]);
    try {
      const results: Array<{ ms: number; ok: boolean }> = [];
      for (let seed = 1; seed <= 6; seed++) {
        results.push(await api.runPhotoCheck(seed));
        setChecks([...results]);
      }
      setDone(
        results.every((r) => r.ok)
          ? "All six checks passed."
          : "Some checks were too slow. Photos can't be turned on yet.",
      );
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (status === null && error === null)
    return <Spinner label="Loading photo storage…" />;
    // Deletions keep being queued after photos are turned off, so the schedule matters whenever files are waiting.
  const stale = Boolean(status && (status.photosEnabled || status.queued > 0) && (!status.lastScheduledAt || Date.now() - Date.parse(status.lastScheduledAt) > 2 * 3600_000))
    status?.photosEnabled &&
    (!status.lastScheduledAt ||
      Date.now() - Date.parse(status.lastScheduledAt) > 2 * 3600_000);
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-display text-lg font-bold text-ink-900">
        Photo storage
      </h2>
      {status && (
        <>
          <dl className="grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2">
            <div>
              <dt className="text-ink-500">Photo posting</dt>
              <dd className="font-semibold text-ink-900">
                {status.photosEnabled ? "On" : "Off"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Stored (cap)</dt>
              <dd className="font-semibold text-ink-900">
                {mb(status.usedBytes)} ({mb(status.capBytes)})
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Waiting to be deleted</dt>
              <dd className="font-semibold text-ink-900">{status.queued}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Kept as evidence for reports</dt>
              <dd className="font-semibold text-ink-900">{status.held}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Last scheduled cleanup</dt>
              <dd className="font-semibold text-ink-900">
                {status.lastScheduledAt ? (
                  <When iso={status.lastScheduledAt} />
                ) : (
                  "Never"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Egress thresholds</dt>
              <dd className="font-semibold text-ink-900">
                {status.egressReviewGb === null
                  ? "not set"
                  : `review at ${status.egressReviewGb} GB, pause at ${status.egressPauseGb} GB`}
              </dd>
            </div>
          </dl>
          {status.failing > 0 && (
            <Message tone="error">{`${status.failing} file(s) failed to delete at least 3 times${status.gaveUp ? ` (${status.gaveUp} gave up after 8 tries)` : ""}. Check the function's logs.`}</Message>
          )}
          {stale && (
            <Message tone="error">
              The scheduled cleanup hasn't run in the last 2 hours. Check the
              schedule (docs/PHOTOS.md).
            </Message>
          )}
          {status.lastRunFailed && (
            <Message tone="error">
              The last cleanup pass couldn't delete every file. It will retry.
            </Message>
          )}
          {status.heldOpenOver30Days > 0 && (
            <Message tone="info">{`${status.heldOpenOver30Days} photo(s) are held for reports open more than 30 days. Please resolve those reports.`}</Message>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={drainNow}
          disabled={busy !== null}
          className={buttonClass("secondary", "sm")}
        >
          {busy === "drain" ? "Cleaning up…" : "Run cleanup now"}
        </button>
        {founder && (
          <button
            type="button"
            onClick={runChecks}
            disabled={busy !== null}
            className={buttonClass("secondary", "sm")}
          >
            {busy === "check" ? "Checking…" : "Run processing check"}
          </button>
        )}
      </div>
      {checks.length > 0 && (
        <ol
          className="list-decimal pl-5 text-sm text-ink-700"
          aria-label="Processing check results"
        >
          {checks.map((c, i) => (
            <li key={i}>
              {c.ms} ms, {c.ok ? "passed" : "too slow"}
            </li>
          ))}
        </ol>
      )}
      {done && <Message tone="success">{done}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <p className="text-[13px] text-ink-500">
        Files are deleted by the server on a schedule, with retries. Reported
        photos are kept while their report is kept.
      </p>
    </Card>
  );
}
