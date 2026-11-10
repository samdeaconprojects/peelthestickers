// src/components/Legal/Legal.js
//
// Privacy Policy and Terms, served at /privacy and /terms (readable signed
// out). When the text changes, update LEGAL_UPDATED and TERMS_VERSION in
// server/server.js so new sign-ups record the version they agreed to.
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "./Legal.css";

export const LEGAL_UPDATED = "November 10, 2026";
export const CONTACT_EMAIL = "ptstimer@gmail.com";

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

function LegalShell({ title, children, other }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Peel The Stickers`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="Page legalPage">
      <h1>{title}</h1>
      <p className="legalPage__updated">Last updated {LEGAL_UPDATED}</p>
      {children}
      <p className="legalPage__nav">
        <Link to={other.to}>{other.label}</Link> · <Link to="/">Back to the timer</Link>
      </p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" other={{ to: "/terms", label: "Terms" }}>
      <p>
        Peel The Stickers ("PTS", "we") is a speedcubing timer and community. This page explains
        what we collect, why, who can see it, and how to get it removed. Questions: <Mail />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your username, email address and password. We store only a
          one-way hash of your password, never the password itself. Your email is private: it's
          never shown on your profile or to other users. We don't ask for your real name, birthday
          or phone number.
        </li>
        <li>
          <strong>Profile:</strong> whatever you add, such as display name, color, favorite event,
          cube collection, chosen stats and privacy settings.
        </li>
        <li>
          <strong>Cubing data:</strong> your solves (times, scrambles, penalties, tags, notes),
          sessions, custom events and the statistics computed from them, including anything you
          import from other timers.
        </li>
        <li>
          <strong>WCA data:</strong> if you link a WCA ID, we fetch that person's public results
          and competitions from the World Cube Association's public API and store them with your
          account.
        </li>
        <li>
          <strong>Social:</strong> posts, comments, direct and group messages, follows, friends,
          groups, rooms and shared sessions you take part in.
        </li>
        <li>
          <strong>Settings:</strong> app preferences and your time zone, used to group solves by
          day.
        </li>
        <li>
          <strong>Technical:</strong> your IP address is used briefly in memory to rate-limit
          abuse and is not stored with your account. Our server keeps short error logs to fix
          problems. If we show ads, ad partners receive the technical data your browser sends them
          (such as IP address and device type), as described under Advertising.
        </li>
      </ul>

      <h2>How we use your email</h2>
      <p>
        We use your email only to confirm it's yours, to send password-reset links you ask for, and
        for important notices about your account or these policies. We don't send marketing email
        and don't share your address with advertisers. Account emails are sent through Amazon
        Simple Email Service.
      </p>

      <h2>Cookies and device storage</h2>
      <p>
        Your browser's local storage keeps your sign-in token, app preferences, and any solves you
        time while signed out, on your device. That's what lets you stay signed in and keep timing
        offline. PTS itself doesn't use tracking cookies or analytics scripts.
      </p>

      <h2>Advertising</h2>
      <p>
        To keep PTS free we may show ads. Ads would come from third-party ad partners (for example
        Google AdSense), who may use cookies or similar technology on PTS pages to show ads, limit
        how often you see them, measure them and prevent fraud. Where the law allows, this can
        include ads personalized from your activity across sites.
      </p>
      <ul>
        <li>
          Before ads go live we'll list our ad partners on this page. Where the law requires it
          (for example in the EU and UK) we'll ask for your consent first.
        </li>
        <li>
          You can opt out of personalized ads, for example at{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
            Google's ad settings
          </a>{" "}
          or{" "}
          <a href="https://optout.aboutads.info" target="_blank" rel="noopener noreferrer">
            aboutads.info
          </a>
          .
        </li>
        <li>
          Ad partners don't get your account data: your username, email, password, solves, posts
          and messages are never given to advertisers. We don't sell your account data.
        </li>
      </ul>

      <h2>Who can see your data</h2>
      <p>
        Your username and basic profile are visible to other signed-in users. Your stats, solves
        and posts follow the privacy settings on your profile. Messages are visible to the people
        in that conversation. Comments are visible to anyone who can see the post. Data you put
        in shared rooms, groups and tournaments is visible to their members.
      </p>

      <h2>Where it's stored</h2>
      <p>
        Your data is stored on Amazon Web Services in the United States, which hosts our servers
        and database. AWS processes it only to run PTS. Connections to PTS are encrypted (HTTPS). Database backups are kept for up
        to 35 days.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account exists. When you ask us to delete your account, we
        delete your profile, solves, posts and other account data within 30 days. Copies in
        backups age out within 35 days after that. Messages you sent may remain visible to the
        people you sent them to.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Edit your profile and privacy settings at any time in the app.</li>
        <li>
          Ask for a copy of your data, a correction, or deletion of your account by emailing{" "}
          <Mail /> from the email address on your account, with your username, so we can confirm
          it's you.
        </li>
        <li>
          Depending on where you live (for example the EU, UK or California) you may have
          further rights under local law; contact us and we'll honor them.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        PTS is for people aged 13 and over. We don't knowingly collect data from children under
        13. If you believe a child under 13 has an account, email <Mail /> and we'll delete it.
        If we show ads, we'll ask our ad partners not to personalize them for users we know are
        under 16 where the law requires it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy we'll update the date above, and for significant changes we'll
        let you know in the app.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use" other={{ to: "/privacy", label: "Privacy Policy" }}>
      <p>
        These terms apply when you use Peel The Stickers ("PTS", "we"). By creating an account or
        using PTS you agree to them. Questions: <Mail />.
      </p>

      <h2>Who can use PTS</h2>
      <p>
        You must be at least 13 years old. If you're under the age of adulthood where you live,
        you need a parent or guardian's permission.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You're responsible for what happens on your account.</li>
        <li>
          Use an email address you control, so you can confirm it and reset your password. One
          account per email address.
        </li>
        <li>
          Don't pick a username that impersonates another person, cuber or organization. We may
          rename or remove accounts that do.
        </li>
        <li>
          Only link a WCA ID that is your own. WCA results shown on PTS are not verified by the WCA
          unless we say so.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own the solves, posts, comments and messages you add. You give PTS permission to
        store, process and display them to provide the service, according to your privacy
        settings. You can delete your posts at any time, and ask us to delete your account.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't:</p>
      <ul>
        <li>harass, threaten, bully or hate on other people, or post sexual or violent content;</li>
        <li>spam, scam, or post anything illegal or that infringes someone else's rights;</li>
        <li>impersonate someone or fake times and results to mislead others;</li>
        <li>
          try to break, overload, scrape or get around the security or limits of PTS, or access
          accounts or data that aren't yours.
        </li>
      </ul>
      <p>
        We may remove content or suspend or close accounts that break these rules. Report problems
        to <Mail />.
      </p>

      <h2>Ads</h2>
      <p>
        PTS may show advertising, including ads from third-party partners. We aren't responsible
        for the content of ads or for products and services advertised by others; any dealings with
        an advertiser are between you and them.
      </p>

      <h2>The service</h2>
      <p>
        PTS is provided "as is". We work to keep it running and your data safe, but we can't
        promise it will always be available or error-free, and features may change. Keep your own
        copy of data that matters to you; you can export your solves from the app.
      </p>
      <p>
        To the extent the law allows, PTS isn't liable for indirect or consequential losses, or
        for lost data, arising from your use of the service.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can stop using PTS at any time and ask us to delete your account. We may close
        accounts that break these terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We'll change the date above, and for significant changes we'll
        let you know in the app. Continuing to use PTS after a change means you accept it.
      </p>
    </LegalShell>
  );
}
