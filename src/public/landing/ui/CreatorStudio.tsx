import clsx from 'clsx'
import { Photo } from './Photo'

/**
 * A creator in her bright home studio: the room behind, a ring light, and the
 * creator cut out in front. The cut-out ends at its bottom and right edges, so
 * it sits flush against the frame's bottom and right, where the frame does the
 * cropping. Used in the hero and in WHAT; the caller positions and sizes it.
 */
export function CreatorStudio({ className, eager }: { className?: string; eager?: boolean }) {
  return (
    <div className={clsx('overflow-hidden bg-sp-neutral', className)}>
      <Photo id="studioRoom" eager={eager} className="absolute inset-0 h-full w-full object-cover" />
      <Photo id="ringLight" eager={eager} className="absolute bottom-0 left-[4%] h-[64%] w-auto max-w-none" />
      <Photo id="creatorSmiling" eager={eager} className="absolute bottom-0 right-0 h-[92%] w-auto max-w-none" />
    </div>
  )
}
