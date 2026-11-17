import type { ReactNode } from 'react'
import { PRIVACY_CONTACT } from './contact'

// The Splitpost privacy notice, version 1.0. Every statement matches the
// waitlist code on main: the form (src/public/waitlist/WaitlistForm.tsx), the
// server function (supabase/functions/join-waitlist, run with
// WAITLIST_CLIENT_ADDRESS=ignore) and the database (docs/WAITLIST.md). If the
// code changes what is collected, this text changes first, with a new version.

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-10 font-display text-xl font-bold text-ink-900">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed text-ink-700">{children}</p>
const UL = ({ children }: { children: ReactNode }) => <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed text-ink-700">{children}</ul>
const Mail = () => (
  <a href={`mailto:${PRIVACY_CONTACT}`} className="font-semibold text-brand-700 underline underline-offset-2">
    {PRIVACY_CONTACT}
  </a>
)

export function NoticeBody() {
  return (
    <div data-testid="privacy-notice-body">
      <P>
        Splitpost is a brand of <strong>1000859123 ONTARIO INC.</strong>, a corporation in Ontario, Canada (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        This notice explains what we collect when you join the Splitpost waitlist at www.splitpost.ca, why, how long we keep it, and the
        choices you have. It covers the website and the waitlist only. If you&rsquo;re invited to the Splitpost pilot, we&rsquo;ll tell you
        how your pilot account works before you create it.
      </P>

      <H2>One waitlist for everyone</H2>
      <P>Everyone joins the same way and sees the same questions. There&rsquo;s no separate list or account type for creators or anyone else.</P>

      <H2>What we collect</H2>
      <P>
        <strong>Always:</strong>
      </P>
      <UL>
        <li>Your email address, so we can contact you about the pilot.</li>
        <li>That you confirmed you&rsquo;re 18 or older. We don&rsquo;t ask for your date of birth.</li>
        <li>Your agreement to join, the version of this notice you saw, and when you agreed. This is our record of your consent.</li>
        <li>When you joined.</li>
      </UL>
      <P>
        <strong>Only if you choose to answer:</strong>
      </P>
      <UL>
        <li>What interests you most about Splitpost, from a fixed list.</li>
        <li>Whether you share content online now, and if you do, your main platform and roughly how many people follow you (one of four ranges).</li>
        <li>Whether a creator introduced you to Splitpost: yes or no. We don&rsquo;t ask who.</li>
      </UL>
      <P>
        <strong>From the link you used, if it had one:</strong> a short label we chose for where you found us (for example, a newsletter).
      </P>
      <P>
        We don&rsquo;t collect your name, social media handles, address, phone number, payment details or free text. We don&rsquo;t store
        your IP address, or anything made from it, with your entry. Like most websites, our hosting providers may keep short-lived
        technical logs of requests, which include network addresses.
      </P>
      <P>
        Your optional answers never decide what you can do on Splitpost, and leaving them blank doesn&rsquo;t affect your place on the
        waitlist. If you join again with the same email address, nothing changes. To change your answers, email us.
      </P>

      <H2>How we use it</H2>
      <UL>
        <li>
          <strong>To invite people to the pilot,</strong> in small groups. Your optional answers help us invite a balanced mix of people. When
          we invite a group, we note why, from a short fixed list. Joining doesn&rsquo;t guarantee an invitation.
        </li>
        <li>
          <strong>To understand, in totals,</strong> how people hear about us. We count sign-ups by the hour, by the label above and by your
          yes or no answer about a creator. These counts don&rsquo;t include your email address.
        </li>
        <li>
          <strong>To keep the waitlist working and safe:</strong> the form uses Cloudflare Turnstile to tell people from automated programs.
          Cloudflare processes information from your browser to do this, under its own privacy policy. To slow down abuse, we also keep
          short-lived counters made from a one-way, keyed code of your email address, which can&rsquo;t be turned back into the address. We
          delete them after two days.
        </li>
      </UL>
      <P>We don&rsquo;t sell your information, use it for advertising, or send you marketing.</P>

      <H2>Who else handles it</H2>
      <P>We use these service providers. They process information only to provide their service to us:</P>
      <UL>
        <li>
          <strong>Supabase</strong> stores the waitlist and runs the form&rsquo;s server function, in the <strong>United States</strong> (West
          US, Oregon).
        </li>
        <li>
          <strong>Vercel</strong> hosts the website.
        </li>
        <li>
          <strong>Cloudflare</strong> runs the Turnstile check.
        </li>
      </UL>
      <P>
        Your waitlist entry is stored in the United States, and these providers may process information in other countries. Information
        stored or processed outside Canada is subject to the laws of those countries and may be accessible to their courts, law enforcement
        and national security authorities.
      </P>

      <H2>How long we keep it</H2>
      <UL>
        <li>
          <strong>Your waitlist entry,</strong> including your answers and consent record: 12 months after you joined or last confirmed your
          place, then we delete it. Joining again with the same address doesn&rsquo;t extend this.
        </li>
        <li>
          <strong>The hourly counts:</strong> 90 days.
        </li>
        <li>
          <strong>The rate limit counters:</strong> two days.
        </li>
      </UL>

      <H2>Leaving the waitlist and your other rights</H2>
      <P>
        To leave the waitlist, email <Mail /> from the address you joined with. We&rsquo;ll delete your entry, your answers, your consent
        record and any invitation not yet accepted, and reply to confirm. If you write from a different address, we may ask you to confirm
        the address is yours first.
      </P>
      <P>
        You can also email <Mail /> to see or correct the information we hold about you, to withdraw your consent (we do this by deleting your
        entry), or with any question about this notice. We&rsquo;ll reply within 30 days. If you&rsquo;re not satisfied with our answer, you
        can contact the Office of the Privacy Commissioner of Canada.
      </P>

      <H2>Who can join</H2>
      <P>Splitpost is for adults 18 and older. If we learn that someone under 18 has joined, we delete their entry.</P>

      <H2>Changes to this notice</H2>
      <P>
        If we change this notice, we&rsquo;ll publish the new version here with a new version number and date. If a change affects how we use
        information you&rsquo;ve already given us, we&rsquo;ll ask for your agreement again first.
      </P>

      <H2>Contact</H2>
      <P>
        1000859123 ONTARIO INC. (Splitpost)
        <br />
        1890 Marconi Boulevard, London, Ontario N5V 4T5, Canada
        <br />
        <Mail />
      </P>
    </div>
  )
}
