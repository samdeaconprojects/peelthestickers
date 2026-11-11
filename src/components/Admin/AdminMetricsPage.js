import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../services/api";
import "./AdminMetricsPage.css";

const SORTS = {
  solves: { label: "Total solves", get: (u) => u.solves },
  liveSolves: { label: "Live solves", get: (u) => u.liveSolves },
  importedSolves: { label: "Imported", get: (u) => u.importedSolves },
  added1d: { label: "Added 24h", get: (u) => u.added1d?.added ?? -Infinity },
  added7d: { label: "Added 7d", get: (u) => u.added7d?.added ?? -Infinity },
  livePerDay: { label: "Live / day (lifetime)", get: (u) => u.livePerDay },
  followers: { label: "Followers", get: (u) => u.followers },
  createdAt: { label: "Joined", get: (u) => u.createdAt || "" },
  lastSolveAt: { label: "Last solve", get: (u) => u.lastSolveAt || "" },
};

const PAGE = 100;

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" });
}

function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Added({ value }) {
  if (!value) return <span className="dim" title="No snapshot from before this window yet">—</span>;
  const n = value.added;
  return (
    <span title={`Since ${new Date(value.since).toLocaleString()} · ${fmt(value.liveAdded)} live`}>
      {n > 0 ? "+" : ""}{fmt(n)}
    </span>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="adminTile">
      <div className="adminTile__label">{label}</div>
      <div className="adminTile__value">{value}</div>
      {sub ? <div className="adminTile__sub">{sub}</div> : null}
    </div>
  );
}

export default function AdminMetricsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [sortKey, setSortKey] = useState("solves");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await apiGet(`/api/admin/metrics${refresh ? "?refresh=1" : ""}`));
    } catch (e) {
      setError(e?.message || "Could not load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const rebuild = async () => {
    if (!window.confirm("Scan the whole table to find every account? This reads every item once, so it costs more on a big table.")) return;
    setRebuilding(true);
    setError("");
    try {
      await apiPost("/api/admin/metrics/rebuild-registry", {});
      await load(true);
    } catch (e) {
      setError(e?.message || "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  const users = useMemo(() => {
    const list = Array.isArray(data?.users) ? data.users : [];
    const q = query.trim().toLowerCase();
    const get = SORTS[sortKey].get;
    return list
      .filter((u) => !flaggedOnly || u.flags.length)
      .filter((u) => !q || u.userID.toLowerCase().includes(q) || String(u.name || "").toLowerCase().includes(q))
      .sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        if (av === bv) return b.solves - a.solves;
        return av < bv ? 1 : -1;
      });
  }, [data, sortKey, flaggedOnly, query]);

  if (error && !data) {
    return (
      <div className="adminPage">
        <h1>Admin metrics</h1>
        <p className="adminPage__error">{error}</p>
        <button type="button" className="adminBtn" onClick={() => load(true)}>Try again</button>
      </div>
    );
  }

  const s = data?.summary;
  const signups = s ? Object.entries(s.signupsByDay) : [];
  const maxSignup = Math.max(1, ...signups.map(([, n]) => n));
  const events = s ? Object.entries(s.solvesByEvent).sort((a, b) => b[1] - a[1]) : [];
  const maxEvent = Math.max(1, ...events.map(([, n]) => n));
  const shown = users.slice(0, limit);

  return (
    <div className="adminPage">
      <header className="adminPage__head">
        <div>
          <h1>Admin metrics</h1>
          <div className="adminPage__meta">
            {data ? `Updated ${ago(data.generatedAt)} · took ${fmt(data.tookMs)} ms · cached 5 min` : "Loading…"}
          </div>
        </div>
        <div className="adminPage__actions">
          <button type="button" className="adminBtn" onClick={() => load(true)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="adminBtn adminBtn--ghost" onClick={rebuild} disabled={rebuilding}>
            {rebuilding ? "Scanning…" : "Rebuild user index"}
          </button>
        </div>
      </header>

      {error ? <p className="adminPage__error">{error}</p> : null}
      {data?.registryEmpty ? (
        <p className="adminPage__notice">
          The user index is empty. Accounts made before this page existed aren't in it yet. Click
          <strong> Rebuild user index</strong> once to add them; new signups are added automatically.
        </p>
      ) : null}

      {s && s.partialRecent > 0 && !data?.registryEmpty ? (
        <p className="adminPage__meta adminPage__hint">
          "Added" numbers come from daily snapshots, so for the first week they cover less than the full
          window for {fmt(s.partialRecent)} accounts. Hover a number to see when it counts from.
        </p>
      ) : null}

      {s ? (
        <>
          <section className="adminTiles">
            <Tile label="Users" value={fmt(s.users)} sub={`+${fmt(s.newUsers.d1)} today · +${fmt(s.newUsers.d7)} 7d · +${fmt(s.newUsers.d30)} 30d`} />
            <Tile label="Solves" value={fmt(s.solves)} sub={`${fmt(s.liveSolves)} live · ${fmt(s.importedSolves)} imported`} />
            <Tile label="Solves added" value={`+${fmt(s.solvesAdded.d1)}`} sub={`in 24h · +${fmt(s.solvesAdded.d7)} in 7d (${fmt(s.solvesAdded.liveD7)} live)`} />
            <Tile label="Active (solved)" value={fmt(s.activeUsers.d7)} sub={`${fmt(s.activeUsers.d1)} today · ${fmt(s.activeUsers.d30)} in 30d`} />
            <Tile label="Users with solves" value={fmt(s.usersWithSolves)} sub={`${fmt(s.verifiedUsers)} email verified · ${fmt(s.paidUsers)} paid`} />
            <Tile label="Flagged" value={fmt(s.flaggedUsers)} sub="Solve bursts, huge or fast accounts" />
          </section>

          <section className="adminPanels">
            <div className="adminPanel">
              <h2>Signups, last 30 days</h2>
              <div className="adminSpark" role="img" aria-label="Signups per day for the last 30 days">
                {signups.map(([day, n]) => (
                  <div key={day} className="adminSpark__col" title={`${day}: ${n}`}>
                    <div className="adminSpark__bar" style={{ height: `${(n / maxSignup) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="adminSpark__axis">
                <span>{signups[0]?.[0]}</span>
                <span>{signups[signups.length - 1]?.[0]}</span>
              </div>
            </div>
            <div className="adminPanel">
              <h2>Solves by event</h2>
              <div className="adminEvents">
                {events.length === 0 ? <div className="adminPage__meta">No solves yet</div> : null}
                {events.map(([ev, n]) => (
                  <div key={ev} className="adminEvents__row">
                    <span className="adminEvents__name">{ev}</span>
                    <span className="adminEvents__track">
                      <span className="adminEvents__fill" style={{ width: `${(n / maxEvent) * 100}%` }} />
                    </span>
                    <span className="adminEvents__n">{fmt(n)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="adminPanel">
            <div className="adminTable__controls">
              <h2>Accounts</h2>
              <input
                className="adminInput"
                placeholder="Search username or name"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
              />
              <label className="adminCheck">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => { setFlaggedOnly(e.target.checked); setLimit(PAGE); }} />
                Flagged only
              </label>
              <label className="adminCheck">
                Sort
                <select className="adminInput" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <span className="adminPage__meta">{fmt(users.length)} accounts</span>
            </div>
            <div className="adminTable__wrap">
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Account</th>
                    <th className="num">Solves</th>
                    <th className="num">Live</th>
                    <th className="num">Imported</th>
                    <th className="num">+24h</th>
                    <th className="num">+7d</th>
                    <th className="num">Live/day</th>
                    <th>Top events</th>
                    <th>Joined</th>
                    <th>Last solve</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u, i) => (
                    <tr key={u.userID} className={u.flags.length ? "is-flagged" : ""}>
                      <td className="dim">{i + 1}</td>
                      <td>
                        <Link to={`/profile/${encodeURIComponent(u.userID)}`}>{u.username}</Link>
                        {u.name ? <div className="dim">{u.name}</div> : null}
                        <div className="adminBadges">
                          {u.isPaid ? <span className="adminBadge">paid</span> : null}
                          {u.emailVerified === false ? <span className="adminBadge adminBadge--dim">unverified</span> : null}
                          {!u.hasPassword ? <span className="adminBadge adminBadge--dim">legacy</span> : null}
                          {u.privateAccount ? <span className="adminBadge adminBadge--dim">private</span> : null}
                        </div>
                      </td>
                      <td className="num strong">{fmt(u.solves)}</td>
                      <td className="num">{fmt(u.liveSolves)}</td>
                      <td className="num">{fmt(u.importedSolves)}</td>
                      <td className="num"><Added value={u.added1d} /></td>
                      <td className="num"><Added value={u.added7d} /></td>
                      <td className="num">{fmt(u.livePerDay)}</td>
                      <td className="dim">
                        {Object.entries(u.events).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ev, n]) => `${ev} ${fmt(n)}`).join(" · ") || "—"}
                      </td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>{ago(u.lastSolveAt)}</td>
                      <td className="adminTable__flags">
                        {u.flags.map((f) => <span key={f.code + f.text} className="adminFlag">{f.text}</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length > limit ? (
              <button type="button" className="adminBtn adminBtn--ghost adminTable__more" onClick={() => setLimit((n) => n + PAGE)}>
                Show {fmt(Math.min(PAGE, users.length - limit))} more
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
