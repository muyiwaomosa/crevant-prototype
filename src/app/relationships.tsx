import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, HandHeart, ShieldCheck, Sparkles, Users } from "lucide-react";
import {
  Card,
  EmptyState,
  Modal,
  PageHeader,
  buttonClass,
} from "../components/ui";
import { Message } from "../public/auth/AuthUi";
import {
  SUPPORT_CHOICES,
  type Audience,
  type FollowedCreator,
  type Relationship,
  type SupportChoice,
} from "./api";
import { useAppApi } from "./AppApiContext";
import { ErrorNote, MemberAvatar, MemberLink, When } from "./components";

/**
 * Relationships and Home (IP-2, SP-DESIGN-002). Three stages: Following,
 * Clique Connection (chosen, no limit) and Active Supporter (meaningful
 * activity in the last 28 days). Mute hides a creator from Home only.
 * Support Intent is non-binding: nothing is charged, now or later.
 */

/** A followed creator, with the relationship details when the database has them. */
type Row = FollowedCreator &
  Partial<Pick<Relationship, "activeSupporter" | "muted" | "supportChoice">>;

export const SUPPORT_LABEL: Record<SupportChoice, string> = Object.fromEntries(
  SUPPORT_CHOICES.map((c) => [c.value, c.label]),
) as Record<SupportChoice, string>;

/** Relationship management: your Clique and everyone you follow, with mute. */
export function CliquePage() {
  const api = useAppApi();
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [withDetails, setWithDetails] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    try {
      const rel = await api.relationships();
      if (rel) {
        setRows(rel);
        setWithDetails(true);
      } else {
        setRows(await api.following());
        setWithDetails(false);
      }
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const changed = useCallback(
    async (message: string) => {
      setStatus(message);
      await load();
    },
    [load],
  );
  const all = rows ?? [];
  const inner = all.filter((f) => f.inMyClique);

  return (
    <>
      <PageHeader
        title="Your Clique"
        subtitle="The creators you choose to keep closest, from the people you follow. Choose as many as you like. It never changes the order of your feed."
      />
      <p aria-live="polite" data-testid="clique-status" className="sr-only">
        {status}
      </p>
      {rows === undefined && error === null && (
        <p className="text-sm text-ink-600">Loading your Clique…</p>
      )}
      {error !== null && <ErrorNote error={error} />}
      {rows && (
        <>
          <section aria-labelledby="my-clique-title">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2
                id="my-clique-title"
                className="font-display text-lg font-bold text-ink-900"
              >
                My Clique
              </h2>
              <span className="text-sm font-semibold tabular-nums text-ink-500">
                {inner.length} in your Clique
              </span>
            </div>
            {inner.length === 0 ? (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="Nobody in your Clique yet"
                body={
                  all.length === 0
                    ? "Follow people first, then choose who belongs in your Clique."
                    : "Add creators from Following below. You can change them at any time."
                }
                action={
                  all.length === 0 ? (
                    <Link to="/app/discover" className={buttonClass("primary")}>
                      Discover people
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-600">
                  Removing someone from your Clique keeps them in Following.
                </p>
                <ul className="space-y-2">
                  {inner.map((f) => (
                    <li key={f.id}>
                      <RelationshipRow
                        creator={f}
                        withDetails={withDetails}
                        onChange={changed}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {all.length > 0 && (
            <section aria-labelledby="following-title" className="mt-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2
                  id="following-title"
                  className="font-display text-lg font-bold text-ink-900"
                >
                  Following
                </h2>
                <span className="text-sm font-semibold tabular-nums text-ink-500">
                  {all.length} {all.length === 1 ? "creator" : "creators"}
                </span>
              </div>
              <p className="mb-3 text-sm text-ink-600">
                Everyone you follow. Unfollowing also removes someone from your
                Clique.
                {withDetails
                  ? " Muting hides their posts from your Home and keeps the follow."
                  : ""}
              </p>
              <ul className="space-y-2">
                {all.map((f) => (
                  <li key={f.id}>
                    <RelationshipRow
                      creator={f}
                      withDetails={withDetails}
                      onChange={changed}
                      following
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

/** The stage chips for one relationship. */
function StageChips({ creator }: { creator: Row }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {creator.inMyClique && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-spark-100 px-2 text-[12px] font-semibold text-[#7a3d12]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Clique
          Connection
        </span>
      )}
      {creator.activeSupporter && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#e7f4f1] px-2 text-[12px] font-semibold text-[#1f5e52]">
          <HandHeart className="h-3.5 w-3.5" aria-hidden="true" /> Active
          Supporter
        </span>
      )}
      {creator.muted && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-ink-100 px-2 text-[12px] font-semibold text-ink-700">
          <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Muted on Home
        </span>
      )}
    </span>
  );
}

function RelationshipRow({
  creator,
  withDetails,
  onChange,
  following = false,
}: {
  creator: Row;
  withDetails: boolean;
  onChange: (message: string) => Promise<void>;
  following?: boolean;
}) {
  const api = useAppApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = creator.displayName;
  async function run(action: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChange(message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <MemberAvatar member={creator} size={40} />
          <div className="min-w-0 leading-tight">
            <MemberLink member={creator} />
            <p className="truncate text-[13px] text-ink-500">
              @{creator.username} ·{" "}
              {creator.inMyClique && creator.cliqueAddedAt ? (
                <>
                  in your Clique since <When iso={creator.cliqueAddedAt} />
                </>
              ) : (
                <>
                  following since <When iso={creator.followedAt} />
                </>
              )}
            </p>
            {withDetails && (
              <div className="mt-1.5">
                <StageChips creator={creator} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!following ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () => api.cliqueRemove(creator.id),
                  `${name} was removed from your Clique. You still follow them.`,
                )
              }
              className={buttonClass("secondary", "sm")}
            >
              Remove from Clique
              <span className="sr-only">{` (${name}, you keep following them)`}</span>
            </button>
          ) : (
            <>
              {creator.inMyClique ? (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-sm font-semibold text-brand-700">
                  <Users className="h-4 w-4" aria-hidden="true" /> Clique
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => api.cliqueAdd(creator.id),
                      `${name} was added to your Clique.`,
                    )
                  }
                  className={buttonClass("secondary", "sm")}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Join
                  Clique<span className="sr-only">{` (${name})`}</span>
                </button>
              )}
              {withDetails &&
                (creator.muted ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.unmute(creator.id),
                        `${name}'s posts are back on your Home.`,
                      )
                    }
                    className={buttonClass("ghost", "sm")}
                  >
                    Unmute<span className="sr-only">{` ${name}`}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.mute(creator.id),
                        `${name} is muted. Their posts won't show on your Home, and you still follow them.`,
                      )
                    }
                    className={buttonClass("ghost", "sm")}
                  >
                    Mute
                    <span className="sr-only">{` ${name} on your Home (you keep following them)`}</span>
                  </button>
                ))}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => api.unfollow(creator.id), `You unfollowed ${name}.`)
                }
                className={buttonClass("ghost", "sm")}
              >
                Unfollow
                <span className="sr-only">
                  {creator.inMyClique
                    ? ` ${name} (also removes them from your Clique)`
                    : ` ${name}`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
      {error !== null && <ErrorNote error={error} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Support Intent: the labelled button and the non-binding sheet.

export function SupportButton({
  creator,
  size = "md",
}: {
  creator: { id: string; displayName: string };
  size?: "sm" | "md";
}) {
  const api = useAppApi();
  const [open, setOpen] = useState(false);
  // undefined: not available on this database (the button is hidden).
  const [current, setCurrent] = useState<SupportChoice | null | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    api.supportIntent(creator.id).then(
      (c) => live && (setCurrent(c), setLoaded(true)),
      () => live && (setCurrent(undefined), setLoaded(true)),
    );
    return () => {
      live = false;
    };
  }, [api, creator.id]);
  if (!loaded || current === undefined) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={buttonClass("secondary", size)}
        data-testid="support-button"
      >
        <HandHeart className="h-4 w-4 text-brand-700" aria-hidden="true" />{" "}
        Support
        <span className="sr-only">{` ${creator.displayName}${current ? ` (you said ${SUPPORT_LABEL[current]})` : ""}`}</span>
      </button>
      <SupportSheet
        open={open}
        creator={creator}
        current={current}
        onClose={() => setOpen(false)}
        onSaved={setCurrent}
      />
    </>
  );
}

function SupportSheet({
  open,
  creator,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  creator: { id: string; displayName: string };
  current: SupportChoice | null;
  onClose: () => void;
  onSaved: (c: SupportChoice | null) => void;
}) {
  const api = useAppApi();
  const [choice, setChoice] = useState<SupportChoice | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const groupId = useId();
  useEffect(() => {
    if (open) {
      setChoice(current);
      setError(null);
      setSaved(null);
    }
  }, [open, current]);
  const first = creator.displayName.split(/\s+/)[0] || creator.displayName;
  async function save(next: SupportChoice | "withdrawn") {
    setBusy(true);
    setError(null);
    try {
      await api.recordSupportIntent(creator.id, next);
      onSaved(next === "withdrawn" ? null : next);
      setSaved(
        next === "withdrawn"
          ? "Your support intent was withdrawn."
          : `Recorded: ${SUPPORT_LABEL[next]}. Thank you for telling ${first}.`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Show ${first} you'd support their work`}
    >
      <div className="space-y-4" data-testid="support-sheet">
        <p className="text-[15px] text-ink-700" id={groupId}>
          How much would you be willing to support {first}'s work?
        </p>
        <div
          role="radiogroup"
          aria-labelledby={groupId}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {SUPPORT_CHOICES.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] font-semibold ${
                choice === c.value
                  ? "border-brand-600 text-brand-700 ring-1 ring-brand-600"
                  : "border-ink-200 text-ink-900"
              }`}
            >
              <input
                type="radio"
                name={`support-${creator.id}`}
                value={c.value}
                checked={choice === c.value}
                onChange={() => setChoice(c.value)}
                className="h-4 w-4 accent-brand-600"
              />
              {c.label}
            </label>
          ))}
        </div>
        <p
          className="flex items-start gap-2 rounded-2xl bg-[#e7f4f1] px-4 py-3 text-[14px] text-[#1f5e52]"
          data-testid="support-disclosure"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Non-binding.</strong> Nothing is charged, now or later. This
            tells {first} and Splitpost what people would be willing to support.
          </span>
        </p>
        <div aria-live="polite">
          {saved && <Message tone="success">{saved}</Message>}
        </div>
        {error !== null && <ErrorNote error={error} />}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !choice}
            onClick={() => choice && save(choice)}
            className={buttonClass("primary", "lg")}
          >
            {busy ? "Saving…" : "Record my support intent"}
          </button>
          {current && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save("withdrawn")}
              className={buttonClass("ghost", "sm")}
            >
              Withdraw my support intent
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={buttonClass("ghost", "sm")}
          >
            {saved ? "Done" : "Not now"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Relationship intelligence for the member as a creator: What happened, What
// it means, What to do next (SP-DESIGN-002 section 9.5).

const SOURCE_LABEL: Record<string, string> = {
  profile: "your profile",
  discover: "Discover",
  post: "your posts",
  catch_up: "catch-up",
  comment: "conversations",
  other: "elsewhere",
  unknown: "before sources were recorded",
};

export function audienceStory(a: Audience): {
  happened: string;
  means: string;
  next: string;
} {
  const change = a.newFollowers7d - a.newFollowersPrev7d;
  const topSource = Object.entries(a.followSources).sort(
    (x, y) => y[1] - x[1],
  )[0];
  const happened =
    a.newFollowers7d > 0
      ? `${a.newFollowers7d} new ${a.newFollowers7d === 1 ? "follower" : "followers"} this week${change > 0 ? `, ${change} more than last week` : change < 0 ? `, ${-change} fewer than last week` : ""}.`
      : a.followerCount > 0
        ? `No new followers this week. ${a.followerCount} ${a.followerCount === 1 ? "person follows" : "people follow"} you.`
        : "Nobody follows you yet.";
  const means =
    a.activeSupporterCount > 0
      ? `${a.activeSupporterCount} of your followers ${a.activeSupporterCount === 1 ? "is an Active Supporter" : "are Active Supporters"}: they took part in your posts in the last 28 days.${topSource ? ` Most new followers found you through ${SOURCE_LABEL[topSource[0]] ?? topSource[0]}.` : ""}`
      : a.followerCount > 0
        ? "None of your followers has joined a conversation on your posts in the last 28 days yet."
        : "People can follow you from your profile, your posts and Discover.";
  const next =
    a.posts28d === 0
      ? "Share your first post this week so your followers have something to respond to."
      : a.activeSupporterCount === 0 && a.followerCount > 0
        ? "Ask your followers a question in your next post: replies are how Active Supporters start."
        : "Reply to the comments on your latest post to keep your Active Supporters close.";
  return { happened, means, next };
}

export function AudienceInsight() {
  const api = useAppApi();
  const [a, setA] = useState<Audience | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api.audience().then(
      (x) => live && setA(x),
      () => live && setA(null),
    );
    return () => {
      live = false;
    };
  }, [api]);
  if (!a) return null;
  const story = audienceStory(a);
  const support = Object.entries(a.supportByChoice).filter(
    ([, n]) => (n ?? 0) > 0,
  );
  return (
    <section data-testid="audience-insight">
      <Card className="mb-4 p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">
          Your audience
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          {[
            ["Followers", a.followerCount],
            ["Clique", a.cliqueCount],
            ["Active Supporters", a.activeSupporterCount],
          ].map(([label, value]) => (
            <div key={label}>
              <dd className="font-display text-xl font-extrabold tabular-nums text-ink-900">
                {value}
              </dd>
              <dt className="text-ink-600">{label}</dt>
            </div>
          ))}
        </dl>
        <ol className="mt-4 space-y-3 text-[14px] leading-relaxed">
          <li>
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-600">
              What happened
            </p>
            <p className="text-ink-900">{story.happened}</p>
          </li>
          <li>
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-600">
              What it means
            </p>
            <p className="text-ink-800">{story.means}</p>
          </li>
          <li className="rounded-2xl bg-spark-50 px-3 py-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#7a3d12]">
              What to do next
            </p>
            <p className="text-ink-900">{story.next}</p>
          </li>
        </ol>
        {a.supportIntentCount > 0 && (
          <p className="mt-4 rounded-2xl border border-dashed border-[#a8d9cf] px-3 py-2 text-[13px] text-ink-800">
            <span className="mr-1.5 rounded-full bg-[#e7f4f1] px-2 py-0.5 text-[11px] font-bold text-[#1f5e52]">
              Non-binding
            </span>
            {a.supportIntentCount}{" "}
            {a.supportIntentCount === 1
              ? "person says they"
              : "people say they"}{" "}
            would support your work
            {support.length > 0 &&
              `: ${support.map(([c, n]) => `${n} at ${SUPPORT_LABEL[c as SupportChoice] ?? c}`).join(", ")}`}
            . Nothing is charged.
          </p>
        )}
      </Card>
    </section>
  );
}
