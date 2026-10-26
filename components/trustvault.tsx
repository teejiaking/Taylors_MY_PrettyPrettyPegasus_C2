"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  FolderLock,
  Inbox,
  Link2,
  Activity,
  Landmark,
  ArrowUpRight,
  ArrowRight,
  Plus,
  FileText,
  LockKeyhole,
  Check,
  X,
  Clock3,
  ChevronRight,
  Building2,
  Fingerprint,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Menu,
  RefreshCw,
  Eye,
  Shield,
  Users,
} from "lucide-react";
import { fieldLabels } from "@/lib/guardian";
import { browserApi, browserPreview } from "@/lib/browser-workspace";
type Identity = {
  id: string;
  name: string;
  role: string;
  email: string;
  organisation?: string;
};
type Doc = {
  id: string;
  title: string;
  kind: string;
  mime: string;
  size: number;
  attributes: Record<string, string>;
  attributeSource: string;
  createdAt: string;
};
type Guardian = {
  risk: string;
  mode: string;
  excessiveFields: string[];
  explanation: string;
  suggestedMinimum: string[];
  suggestedDurationHours: number;
  advisory: string;
};
type RequestItem = {
  id: string;
  purpose: string;
  fields: string[];
  durationHours: number;
  status: string;
  createdAt: string;
  recipient?: Identity;
  guardian?: Guardian;
};
type Grant = {
  id: string;
  approvedFields: string[];
  state: string;
  expiresAt: string;
  consentAt: string;
  document: {
    title: string;
  };
  recipient?: Identity;
  owner?: {
    name: string;
  };
  request: {
    purpose: string;
  };
};
type Proposal = {
  id: string;
  proposerId: string;
  proposer: Identity;
  reviewer?: Identity;
  proposedMaxHours: number;
  previousMaxHours: number;
  reason: string;
  status: string;
  createdAt: string;
  appliedAt?: string;
  proposalHash: string;
};
type Event = {
  id: string;
  action: string;
  outcome: string;
  detail: string;
  createdAt: string;
};
type Data = {
  user: Identity;
  policy: {
    maxDurationHours: number;
    version: number;
  };
  documents?: Doc[];
  requests?: RequestItem[];
  grants?: Grant[];
  proposals?: Proposal[];
  activity: Event[];
  students?: {
    id: string;
    name: string;
  }[];
};
const fmt = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const duration = (h: number) =>
  h >= 24
    ? `${h / 24} day${h === 24 ? "" : "s"}`
    : `${h} hour${h === 1 ? "" : "s"}`;
const roleName = (s: string) =>
  s === "ADMINISTRATOR"
    ? "Administrator"
    : s === "RECIPIENT"
      ? "Recipient"
      : "Student";
const readable = (s: string) => s.toLowerCase().replaceAll("_", " ");
const api = browserApi;
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span />
      {children}
    </span>
  );
}
function FileIcon({ kind = "enrolment" }: { kind?: string }) {
  return (
    <div className={`file-icon ${kind}`}>
      <FileText size={23} />
    </div>
  );
}
export default function TrustVault() {
  const [session, setSession] = useState<{
      user: Identity;
      identities: Identity[];
    } | null>(null),
    [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState("dashboard"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<"upload" | "request" | "proposal" | null>(
      null,
    ),
    [review, setReview] = useState<RequestItem | null>(null),
    [fields, setFields] = useState<string[]>([]),
    [hours, setHours] = useState(24),
    [share, setShare] = useState<{
      attributes: Record<string, string>;
      expiresAt: string;
      purpose: string;
      source: string;
    } | null>(null);
  async function refresh() {
    const nextSession = await api<{
      user: Identity;
      identities: Identity[];
    }>("session");
    const nextData = await api<Data>("overview");
    setSession(nextSession);
    setData(nextData);
  }
  useEffect(() => {
    refresh()
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!modal && !review && !share) return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setModal(null);
        setReview(null);
        setShare(null);
      }
      if (e.key === "Tab") {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not(:disabled),[role="dialog"] input:not(:disabled),[role="dialog"] select,[role="dialog"] textarea,[role="dialog"] a[href]',
          ),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal, review, share, busy]);
  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setToast(success);
      try {
        await refresh();
      } catch {
        setError(
          "Your action completed, but the workspace could not refresh. Reload the page to see the latest state.",
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function switchIdentity(id: string) {
    if (
      await act(
        () => api("identity", "POST", { userId: id }),
        "Demo identity selected.",
      )
    ) {
      setPage("dashboard");
      setReview(null);
      setShare(null);
      setModal(null);
      setMobile(false);
      window.scrollTo({ top: 0 });
    }
  }
  const student = data?.user.role === "STUDENT",
    admin = data?.user.role === "ADMINISTRATOR",
    recipient = data?.user.role === "RECIPIENT";
  const pending = data?.requests?.filter((r) => r.status === "PENDING") ?? [],
    active = data?.grants?.filter((g) => g.state === "ACTIVE") ?? [];
  const nav = student
    ? [
        ["dashboard", "Overview", LayoutDashboard],
        ["vault", "Document vault", FolderLock],
        ["requests", "Requests", Inbox],
        ["sharing", "Sharing centre", Link2],
        ["activity", "Activity log", Activity],
      ]
    : recipient
      ? [
          ["dashboard", "Overview", LayoutDashboard],
          ["portal", "Recipient portal", Building2],
          ["activity", "Activity log", Activity],
        ]
      : [
          ["dashboard", "Overview", LayoutDashboard],
          ["governance", "Governance", Landmark],
          ["activity", "Activity log", Activity],
        ];
  function go(p: string) {
    setPage(p);
    setMobile(false);
    setError("");
    window.scrollTo({ top: 0 });
  }
  function openReview(r: RequestItem) {
    setReview(r);
    setFields(
      r.guardian?.suggestedMinimum.filter((f) => r.fields.includes(f)) ?? [],
    );
    setHours(
      Math.min(24, r.durationHours, data?.policy.maxDurationHours ?? 24),
    );
    setError("");
  }
  async function submitConsent(decision: "APPROVE" | "REJECT") {
    if (!review) return;
    if (
      await act(
        () =>
          api(`requests/${review.id}/decide`, "POST", {
            decision,
            fields: fields.length ? fields : undefined,
            durationHours: hours,
          }),
        decision === "APPROVE"
          ? "Consent saved. Only your selected attributes are shared."
          : "Request rejected. Nothing shared.",
      )
    )
      setReview(null);
  }
  async function seeGrant(g: Grant) {
    setShare(null);
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        attributes: Record<string, string>;
        expiresAt: string;
        purpose: string;
        source: string;
      }>(`grants/${g.id}/access`);
      setShare(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }
  function previewDocument(id: string) {
    try {
      const url = browserPreview(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to open the document.",
      );
    }
  }
  async function resetWorkspace() {
    if (
      await act(
        () => api("demo/reset", "POST"),
        "Demo reset. Sample documents and requests restored.",
      )
    ) {
      setPage("dashboard");
      setReview(null);
      setShare(null);
      setModal(null);
      setMobile(false);
    }
  }
  async function formSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let ok = false;
    if (modal === "upload")
      ok = await act(
        () => api("documents", "POST", f),
        "Document added to this browser tab.",
      );
    if (modal === "request")
      ok = await act(
        () =>
          api("requests", "POST", {
            studentId: f.get("studentId"),
            purpose: f.get("purpose"),
            fields: f.getAll("fields"),
            documentKind: f.get("documentKind"),
            durationHours: Number(f.get("durationHours")),
          }),
        "Request sent. The student must give consent before access.",
      );
    if (modal === "proposal")
      ok = await act(
        () =>
          api("proposals", "POST", {
            proposedMaxHours: Number(f.get("proposedMaxHours")),
            reason: f.get("reason"),
          }),
        "Proposal submitted. Current policy is unchanged.",
      );
    if (ok) setModal(null);
  }
  function requestCards() {
    return (data?.requests?.length ?? 0) > 0 ? (
      <div className="request-list">
        {data?.requests?.map((r) => (
          <article className="request-card" key={r.id}>
            <div className="row">
              <div className="organisation-icon">
                <Building2 size={22} />
              </div>
              <div className="grow">
                <h3>
                  {r.recipient?.organisation ||
                    data?.user.organisation ||
                    "Verified recipient organisation"}
                </h3>
                <span className="muted small">
                  {fmt(r.createdAt)} · {r.fields.length} attributes ·{" "}
                  {duration(r.durationHours)}
                </span>
              </div>
              <Badge
                tone={
                  r.status === "PENDING"
                    ? "amber"
                    : r.status === "APPROVED"
                      ? "teal"
                      : "neutral"
                }
              >
                {readable(r.status)}
              </Badge>
            </div>
            <p>{r.purpose}</p>
            <div className="field-tags">
              {r.fields.map((f) => (
                <span
                  key={f}
                  className={
                    r.guardian?.excessiveFields.includes(f) ? "excessive" : ""
                  }
                >
                  {fieldLabels[f]}
                </span>
              ))}
            </div>
            <div className="card-footer">
              {r.guardian ? (
                <span className={`risk ${r.guardian.risk}`}>
                  <Shield size={15} />
                  {r.guardian.risk === "high"
                    ? "Guardian flagged potentially excessive fields"
                    : r.guardian.risk === "medium"
                      ? "Guardian recommends a closer look"
                      : "Guardian: proportionate request"}
                </span>
              ) : (
                <span className="muted small">
                  No information is shared while pending.
                </span>
              )}
              {student && r.status === "PENDING" && (
                <button
                  className="button small-button"
                  onClick={() => openReview(r)}
                >
                  Review request <ArrowRight size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        icon={<Inbox />}
        title="No requests yet"
        text="New information requests will appear here for review."
      />
    );
  }
  function grantCards() {
    return data?.grants?.length ? (
      <div className="grant-grid">
        {data.grants.map((g) => (
          <article className="panel grant-card" key={g.id}>
            <div className="row between">
              <div className="organisation-icon">
                <Building2 size={22} />
              </div>
              <Badge
                tone={
                  g.state === "ACTIVE"
                    ? "teal"
                    : g.state === "EXPIRED"
                      ? "amber"
                      : "neutral"
                }
              >
                {readable(g.state)}
              </Badge>
            </div>
            <h3>
              {g.recipient?.organisation ||
                g.owner?.name ||
                "Shared information"}
            </h3>
            <p className="muted small">{g.document.title}</p>
            <div className="field-tags">
              {g.approvedFields.map((f) => (
                <span key={f}>
                  <Check size={12} />
                  {fieldLabels[f]}
                </span>
              ))}
            </div>
            <div className="grant-meta">
              <Clock3 size={14} />
              {g.state === "EXPIRED" ? "Expired" : "Expires"} {fmt(g.expiresAt)}
            </div>
            <div className="card-footer">
              <span className="mono small">
                {g.id.startsWith("grant-") ? g.id : g.id.slice(-10)}
              </span>
              {student ? (
                <button
                  className="button danger small-button"
                  disabled={busy || g.state !== "ACTIVE"}
                  onClick={() =>
                    act(
                      () => api(`grants/${g.id}/revoke`, "POST"),
                      "Access revoked. Future application access is blocked.",
                    )
                  }
                >
                  {g.state === "REVOKED" ? "Revoked" : "Revoke access"}
                </button>
              ) : (
                <button
                  className="button small-button"
                  disabled={busy}
                  onClick={() => seeGrant(g)}
                >
                  {g.state === "ACTIVE"
                    ? "View shared information"
                    : "Check access"}{" "}
                  <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        icon={<Link2 />}
        title="No sharing grants"
        text="Approved information will appear here with its expiry and access status."
      />
    );
  }
  function proposals() {
    return data?.proposals?.length ? (
      <div className="proposal-list">
        {data.proposals.map((p) => (
          <article className="panel proposal" key={p.id}>
            <div className="row between">
              <span className="eyebrow">SHARING DURATION POLICY</span>
              <Badge
                tone={
                  p.status === "PENDING"
                    ? "amber"
                    : p.status === "APPLIED"
                      ? "teal"
                      : "neutral"
                }
              >
                {readable(p.status)}
              </Badge>
            </div>
            <h3>
              {duration(p.previousMaxHours)} <ArrowRight size={19} />{" "}
              {duration(p.proposedMaxHours)} maximum
            </h3>
            <p>{p.reason}</p>
            <div className="approval-track">
              <div>
                <CheckCircle2 size={18} />
                <span>
                  Proposed by <strong>{p.proposer.name}</strong>
                </span>
              </div>
              <span className="track-line" />
              <div>
                <Users size={18} />
                <span>
                  {p.reviewer
                    ? `${p.status === "APPLIED" ? "Approved" : "Rejected"} by ${p.reviewer.name}`
                    : "Awaiting a different administrator"}
                </span>
              </div>
            </div>
            <div className="card-footer">
              <span className="muted small">
                {fmt(p.createdAt)} · Immutable proposal{" "}
                <span className="mono">{p.proposalHash.slice(0, 8)}</span>
              </span>
              {p.status === "PENDING" &&
                (p.proposerId === data.user.id ? (
                  <span className="muted small">
                    You proposed this. A second administrator must review.
                  </span>
                ) : (
                  <div className="row">
                    <button
                      className="button ghost small-button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            api(`proposals/${p.id}/review`, "POST", {
                              decision: "REJECT",
                            }),
                          "Proposal rejected. Policy unchanged.",
                        )
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="button primary small-button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            api(`proposals/${p.id}/review`, "POST", {
                              decision: "APPROVE",
                            }),
                          "Second approval recorded. Policy applied exactly once.",
                        )
                      }
                    >
                      <Check size={15} /> Approve & apply
                    </button>
                  </div>
                ))}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        icon={<Landmark />}
        title="No proposals"
        text="Propose a bounded policy change for independent review."
      />
    );
  }
  if (loading)
    return (
      <div className="loading">
        <ShieldCheck size={42} />
        <p>Opening TrustVault…</p>
      </div>
    );
  if (!session || !data)
    return (
      <main className="loading">
        <ShieldCheck size={42} />
        <h1>Unable to open TrustVault</h1>
        <p role="alert">
          {error || "The browser workspace could not be opened."}
        </p>
        <button
          className="button primary"
          onClick={() => {
            setLoading(true);
            setError("");
            refresh()
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          }}
        >
          <RefreshCw size={16} /> Try again
        </button>
      </main>
    );
  const titles: Record<string, [string, string]> = {
    dashboard: [
      student
        ? "Your vault, at a glance"
        : recipient
          ? "Your recipient workspace"
          : "Governance overview",
      student
        ? "A little less paperwork. A lot more control."
        : recipient
          ? "Request only what you need. Access only what is approved."
          : "Thoughtful changes. Shared responsibility.",
    ],
    vault: [
      "Document vault",
      "Your documents stay private until you decide what to share.",
    ],
    requests: [
      "Information requests",
      "Know who is asking, why, and exactly what they need.",
    ],
    sharing: [
      "Sharing centre",
      "Every permission has a purpose, a time limit, and an off switch.",
    ],
    portal: ["Recipient portal", "Try the recipient side of the consent flow."],
    governance: [
      "Policy governance",
      "Every change needs two different administrators.",
    ],
    activity: [
      "Activity log",
      "A clear record of decisions and access, without document contents.",
    ],
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside id="primary-sidebar" className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <div className="brand-mark">
            <ShieldCheck size={24} />
          </div>
          TrustVault
          <span className="brand-dot" />
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => {
            const I = Icon as typeof Shield;
            return (
              <button
                key={String(id)}
                className={`nav-item ${page === id ? "selected" : ""}`}
                onClick={() => go(String(id))}
              >
                <I size={19} />
                <span>{String(label)}</span>
                {id === "requests" && pending.length > 0 && (
                  <span className="nav-count">{pending.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="row">
              <ShieldCheck size={20} />
              <strong>Private by design</strong>
            </div>
            <p>
              Your vault. Your permissions.
              <br />
              Always in your hands.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.user.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
            <div className="grow">
              <strong>{data.user.name}</strong>
              <small>
                {roleName(data.user.role)} {"demo"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              aria-label="Toggle navigation"
              aria-expanded={mobile}
              aria-controls="primary-sidebar"
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={23} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />{" "}
              <strong>
                {page === "dashboard" ? "Overview" : titles[page][0]}
              </strong>
            </span>
          </div>
          <div className="row top-actions">
            {
              <button
                className="button ghost small-button"
                disabled={busy}
                onClick={resetWorkspace}
              >
                <RefreshCw size={15} /> Reset demo
              </button>
            }
            <span className="synthetic-label">
              <span /> Synthetic data only
            </span>
            {
              <label className="identity-switch">
                <span className="sr-only">Switch demo identity</span>
                <select
                  aria-label="Switch demo identity"
                  value={data.user.id}
                  disabled={busy}
                  onChange={(e) => switchIdentity(e.target.value)}
                >
                  {session.identities.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {roleName(i.role)}
                    </option>
                  ))}
                </select>
              </label>
            }
            <span className="avatar top-avatar">
              {data.user.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
          </div>
        </header>
        <div className="demo-bar">
          <span>
            <Fingerprint size={15} />
            {"BROWSER DEMO"}
          </span>
          <p>
            {
              "No account needed. Files and actions stay in this tab and reset on reload."
            }
          </p>
          <LockKeyhole size={14} />
        </div>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "dashboard"
                  ? `WELCOME BACK, ${data.user.name.split(" ")[0].toUpperCase()}`
                  : "YOUR TRUSTVAULT"}
              </div>
              <h1>{titles[page][0]}</h1>
              <p>{titles[page][1]}</p>
            </div>
            {student && ["dashboard", "vault"].includes(page) ? (
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setModal("upload");
                }}
              >
                <Plus size={17} /> Upload document
              </button>
            ) : recipient ? (
              <button
                className="button primary"
                onClick={() => setModal("request")}
              >
                <Plus size={17} /> New request
              </button>
            ) : admin ? (
              <button
                className="button primary"
                onClick={() => setModal("proposal")}
              >
                <Plus size={17} /> Propose change
              </button>
            ) : null}
          </div>
          {error && (
            <div role="alert" className="notice error">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div role="status" className="toast">
              <CheckCircle2 size={18} />
              {toast}
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="stats-grid">
                {(student
                  ? [
                      {
                        label: "Private documents",
                        value: data.documents?.length ?? 0,
                        icon: FolderLock,
                        note: "Available in this tab",
                        color: "blue",
                      },
                      {
                        label: "Pending requests",
                        value: pending.length,
                        icon: Inbox,
                        note: pending.length
                          ? "Ready for your review"
                          : "You’re all caught up",
                        color: "amber",
                      },
                      {
                        label: "Active shares",
                        value: active.length,
                        icon: Link2,
                        note: "Time-limited permissions",
                        color: "teal",
                      },
                    ]
                  : recipient
                    ? [
                        {
                          label: "Requests sent",
                          value: data.requests?.length ?? 0,
                          icon: Inbox,
                          note: "Awaiting explicit consent",
                          color: "blue",
                        },
                        {
                          label: "Pending review",
                          value: pending.length,
                          icon: Clock3,
                          note: "No information shared yet",
                          color: "amber",
                        },
                        {
                          label: "Active grants",
                          value: active.length,
                          icon: Link2,
                          note: "Approved attributes only",
                          color: "teal",
                        },
                      ]
                    : [
                        {
                          label: "Current maximum",
                          value: data.policy.maxDurationHours / 24,
                          icon: Clock3,
                          note: "Days of sharing permitted",
                          color: "blue",
                        },
                        {
                          label: "Pending proposals",
                          value:
                            data.proposals?.filter(
                              (p) => p.status === "PENDING",
                            ).length ?? 0,
                          icon: Landmark,
                          note: "Policy stays unchanged",
                          color: "amber",
                        },
                        {
                          label: "Applied changes",
                          value:
                            data.proposals?.filter(
                              (p) => p.status === "APPLIED",
                            ).length ?? 0,
                          icon: Users,
                          note: "Independently approved",
                          color: "teal",
                        },
                      ]
                ).map((s) => (
                  <div className="panel stat-card" key={s.label}>
                    <div className="row between">
                      <span>{s.label}</span>
                      <span className={`stat-icon ${s.color}`}>
                        <s.icon size={20} />
                      </span>
                    </div>
                    <strong className="stat-value">
                      {String(s.value).padStart(2, "0")}
                    </strong>
                    <span className="stat-note">
                      <span className={`dot ${s.color}`} />
                      {s.note}
                    </span>
                  </div>
                ))}
              </div>
              {student ? (
                <>
                  <div className="guardian-banner">
                    <div className="guardian-symbol">
                      <ShieldCheck size={30} />
                      <span className="spark">✦</span>
                    </div>
                    <div className="grow">
                      <span className="eyebrow">
                        MEET YOUR DOCUMENT REQUEST GUARDIAN
                      </span>
                      <h2>A second look before you share.</h2>
                      <p>
                        Your Guardian highlights information that may go beyond
                        a request’s purpose.
                        <br className="desktop-break" /> You make the final
                        call. Always.
                      </p>
                    </div>
                    <button
                      className="button dark"
                      onClick={() => {
                        go("requests");
                        const r = pending.find(
                          (r) => r.guardian?.risk === "high",
                        );
                        if (r) openReview(r);
                      }}
                    >
                      Review requests <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="dashboard-columns">
                    <section>
                      <div className="section-heading">
                        <h2>
                          Needs your attention{" "}
                          <span className="count-pill">{pending.length}</span>
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => go("requests")}
                        >
                          View all <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {pending.length ? (
                        pending.slice(0, 2).map((r) => (
                          <article className="panel attention-card" key={r.id}>
                            <div className="row">
                              <div className="organisation-icon">
                                <Building2 size={21} />
                              </div>
                              <div className="grow">
                                <h3>
                                  {r.recipient?.organisation?.split(" · ")[0] ||
                                    "Recipient organisation"}
                                </h3>
                                <p className="muted small">
                                  {"Student accommodation · simulated"}
                                </p>
                              </div>
                              <Badge
                                tone={
                                  r.guardian?.risk === "high" ? "rose" : "teal"
                                }
                              >
                                {r.guardian?.risk === "high"
                                  ? "Review carefully"
                                  : "Low risk"}
                              </Badge>
                            </div>
                            <p className="attention-purpose">{r.purpose}</p>
                            <div className="card-footer">
                              <span className="muted small">
                                {r.fields.length} attributes requested ·{" "}
                                {duration(r.durationHours)}
                              </span>
                              <button
                                className="text-button"
                                onClick={() => openReview(r)}
                              >
                                Review <ArrowRight size={15} />
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="panel">
                          <Empty
                            icon={<CheckCircle2 />}
                            title="All caught up"
                            text="You have no pending requests."
                          />
                        </div>
                      )}
                    </section>
                    <section>
                      <div className="section-heading">
                        <h2>Your documents</h2>
                        <button
                          className="text-button"
                          onClick={() => go("vault")}
                        >
                          Open vault <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="panel compact-docs">
                        {data.documents?.slice(0, 3).map((d) => (
                          <button
                            key={d.id}
                            className="compact-doc"
                            onClick={() => previewDocument(d.id)}
                          >
                            <FileIcon kind={d.kind} />
                            <span className="grow">
                              <strong>{d.title}</strong>
                              <small>
                                {d.mime === "application/pdf"
                                  ? "PDF"
                                  : d.mime.split("/")[1].toUpperCase()}{" "}
                                · {(d.size / 1024).toFixed(1)} KB
                              </small>
                            </span>
                            <LockKeyhole size={15} className="muted" />
                          </button>
                        ))}
                        <div className="vault-note">
                          <ShieldCheck size={15} />{" "}
                          {"Files stay in this browser tab."}
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              ) : recipient ? (
                <>
                  <div className="notice info">
                    <Building2 size={20} />
                    <span>
                      <strong>{data.user.organisation}</strong>
                      <br />
                      {
                        "Try requesting and viewing selected sample information."
                      }
                      {
                        "Switch demo identities to try both sides of the consent flow."
                      }
                    </span>
                  </div>
                  <div className="section-heading">
                    <h2>Shared with your organisation</h2>
                    <button
                      className="text-button"
                      onClick={() => go("portal")}
                    >
                      Open portal <ArrowRight size={15} />
                    </button>
                  </div>
                  {grantCards()}
                </>
              ) : (
                <>
                  <div className="notice info">
                    <Landmark size={20} />
                    <span>
                      <strong>Application-level dual approval</strong>
                      <br />
                      {
                        "Switch between Jordan and Sam to try independent review. This is a simulation in your browser."
                      }
                    </span>
                  </div>
                  {proposals()}
                </>
              )}
              <section className="activity-section">
                <div className="section-heading">
                  <h2>Recent activity</h2>
                  <button
                    className="text-button"
                    onClick={() => go("activity")}
                  >
                    Full activity log <ArrowUpRight size={15} />
                  </button>
                </div>
                <ActivityList events={data.activity.slice(0, 3)} />
              </section>
            </>
          )}
          {page === "vault" && (
            <>
              {!data.documents?.some(
                (d) => Object.keys(d.attributes).length > 0,
              ) && (
                <div className="notice info">
                  <FileText size={20} />
                  <span className="grow">
                    <strong>
                      Try selective sharing with synthetic samples
                    </strong>
                    <br />
                    Add three fictional documents to your own private vault. No
                    demo account is needed.
                  </span>
                  <button
                    className="button small-button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => api("documents/samples", "POST", {}),
                        "Three synthetic sample documents added to your vault.",
                      )
                    }
                  >
                    Add synthetic samples
                  </button>
                </div>
              )}
              <div className="notice info">
                <LockKeyhole size={19} />
                <span>
                  <strong>Original files are for your eyes only.</strong>{" "}
                  Uploaded contents are not extracted or verified. Selective
                  sharing uses the explicitly labelled synthetic attributes on
                  seeded samples.
                </span>
              </div>
              <div className="document-grid">
                {data.documents?.map((d) => (
                  <article className="panel document-card" key={d.id}>
                    <div className="row between">
                      <FileIcon kind={d.kind} />
                      <Badge tone="teal">Private</Badge>
                    </div>
                    <h2>{d.title}</h2>
                    <p className="muted small">
                      {d.mime.split("/")[1].toUpperCase()} ·{" "}
                      {(d.size / 1024).toFixed(1)} KB · {fmt(d.createdAt)}
                    </p>
                    <div className="attribute-box">
                      <span className="eyebrow">
                        {Object.keys(d.attributes).length
                          ? "SYNTHETIC SAMPLE ATTRIBUTES"
                          : "NO EXTRACTED ATTRIBUTES"}
                      </span>
                      {Object.entries(d.attributes).map(([k, v]) => (
                        <div key={k}>
                          <span>{fieldLabels[k]}</span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                      {!Object.keys(d.attributes).length && (
                        <p>
                          This file is stored privately. Its contents have not
                          been extracted or verified.
                        </p>
                      )}
                    </div>
                    <div className="small muted source-note">
                      {d.attributeSource}
                    </div>
                    <button
                      className="button full-width"
                      onClick={() => previewDocument(d.id)}
                    >
                      <Eye size={16} /> Preview document{" "}
                      <ArrowUpRight size={15} />
                    </button>
                  </article>
                ))}
                <button
                  className="upload-tile"
                  onClick={() => setModal("upload")}
                >
                  <UploadCloud size={32} />
                  <strong>Add a document</strong>
                  <span>PDF, PNG or JPEG · up to 5 MB</span>
                  <small>Synthetic documents only</small>
                </button>
              </div>
            </>
          )}
          {page === "requests" && (
            <>
              {requestCards()}
              <p className="footnote">
                Guardian assessments are advisory. Rules-based demo analysis is
                not a legal finding or a guarantee of safety.
              </p>
            </>
          )}
          {page === "sharing" && (
            <>
              <div className="notice info">
                <ShieldCheck size={19} />
                <span>
                  Revoking a grant blocks future access through TrustVault.
                  Information already viewed or copied cannot be erased.
                </span>
              </div>
              {grantCards()}
            </>
          )}
          {page === "portal" && (
            <>
              <div className="notice info">
                <Building2 size={21} />
                <span>
                  <strong>{data.user.organisation}</strong>
                  <br />
                  {"Demo identity"}: {data.user.email}. Grant access is tied to
                  this identity.
                </span>
              </div>
              <div className="section-heading">
                <h2>Shared information</h2>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(() => Promise.resolve(), "Workspace refreshed.")
                  }
                >
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>
              {grantCards()}
              <div className="section-heading spaced">
                <h2>Your requests</h2>
              </div>
              {requestCards()}
            </>
          )}
          {page === "governance" && (
            <>
              <div className="policy-bar">
                <div>
                  <span className="eyebrow">
                    CURRENT APPLIED POLICY · VERSION {data.policy.version}
                  </span>
                  <h2>
                    {duration(data.policy.maxDurationHours)} maximum sharing
                    duration
                  </h2>
                </div>
                <Badge tone="teal">{"Demo sharing policy"}</Badge>
              </div>
              <div className="notice info">
                <Users size={20} />
                <span>
                  <strong>Application-level two-person approval.</strong>{" "}
                  Proposals are immutable. A different administrator must
                  approve or reject. Pending and rejected proposals never change
                  policy.{" "}
                  {
                    "Demo role switching simulates this workflow; it is not real authentication."
                  }
                </span>
              </div>
              {proposals()}
            </>
          )}
          {page === "activity" && <ActivityList events={data.activity} />}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} /> TrustVault · Your information. Your
              decision.
            </span>
            <span>Hackathon prototype · Synthetic data</span>
          </footer>
        </main>
      </div>
      {(modal || review || share) && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setModal(null);
              setReview(null);
              setShare(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className={`modal ${review ? "review-modal" : ""}`}
          >
            <button
              autoFocus
              aria-label="Close dialog"
              className="icon-button close-modal"
              disabled={busy}
              onClick={() => {
                setModal(null);
                setReview(null);
                setShare(null);
              }}
            >
              <X size={21} />
            </button>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {modal && (
              <form onSubmit={formSubmit}>
                <span className="eyebrow">
                  {modal === "upload"
                    ? "PRIVATE DOCUMENT CUSTODY"
                    : modal === "request"
                      ? "SIMULATED RECIPIENT REQUEST"
                      : "TWO-PERSON GOVERNANCE"}
                </span>
                <h2 id="dialog-title">
                  {modal === "upload"
                    ? "Add to your vault"
                    : modal === "request"
                      ? "Request student information"
                      : "Propose a policy change"}
                </h2>
                <p className="muted">
                  {modal === "upload"
                    ? "Use a synthetic PDF, PNG or JPEG. It stays in this tab until you reload or reset."
                    : modal === "request"
                      ? "Give the student a clear reason for every attribute you request."
                      : "The current policy stays active until a different administrator approves."}
                </p>
                {modal === "upload" ? (
                  <>
                    <label>
                      Document title
                      <input
                        name="title"
                        required
                        minLength={2}
                        maxLength={100}
                        placeholder="e.g. Demo enrolment letter"
                      />
                    </label>
                    <label>
                      Document type
                      <select name="kind">
                        <option value="enrolment">Enrolment certificate</option>
                        <option value="passport">Passport demonstration</option>
                        <option value="insurance">Insurance certificate</option>
                        <option value="other">Other synthetic document</option>
                      </select>
                    </label>
                    <label className="file-input-label">
                      <UploadCloud size={28} />
                      <strong>Choose a synthetic file</strong>
                      <span>PDF, PNG or JPEG · up to 5 MB</span>
                      <input
                        type="file"
                        name="file"
                        accept="application/pdf,image/png,image/jpeg"
                        required
                      />
                    </label>
                    <p className="footnote">
                      No text extraction is performed. This file cannot
                      automatically supply shareable attributes.
                    </p>
                  </>
                ) : modal === "request" ? (
                  <>
                    <label>
                      Student
                      <select name="studentId">
                        {data.students?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {" · synthetic identity"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Document type
                      <select name="documentKind">
                        <option value="enrolment">Enrolment</option>
                        <option value="passport">Passport demonstration</option>
                        <option value="insurance">Insurance</option>
                      </select>
                    </label>
                    <label>
                      Stated purpose
                      <textarea
                        name="purpose"
                        minLength={12}
                        maxLength={500}
                        required
                        defaultValue="Verify student status for a simulated accommodation application."
                      />
                    </label>
                    <fieldset>
                      <legend>Requested attributes</legend>
                      <div className="checkbox-grid">
                        {Object.entries(fieldLabels).map(([k, v]) => (
                          <label className="check-label" key={k}>
                            <input
                              name="fields"
                              type="checkbox"
                              value={k}
                              defaultChecked={k === "enrolmentStatus"}
                            />
                            {v}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      Requested duration (hours)
                      <input
                        name="durationHours"
                        type="number"
                        min={1}
                        max={720}
                        defaultValue={24}
                        required
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="notice info">
                      Current maximum: {duration(data.policy.maxDurationHours)}{" "}
                      · version {data.policy.version}
                    </div>
                    <label>
                      Proposed maximum (hours)
                      <input
                        name="proposedMaxHours"
                        type="number"
                        min={1}
                        max={720}
                        defaultValue={336}
                        required
                      />
                    </label>
                    <label>
                      Reason for the change
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={500}
                        required
                        placeholder="Explain why this limit is appropriate for students."
                      />
                    </label>
                  </>
                )}
                <button disabled={busy} className="button primary full-width">
                  {busy
                    ? "Saving…"
                    : modal === "upload"
                      ? "Add to this tab"
                      : modal === "request"
                        ? "Send request for consent"
                        : "Submit immutable proposal"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
            {review && (
              <>
                <span className="eyebrow">
                  INFORMATION REQUEST · YOUR CONSENT MATTERS
                </span>
                <h2 id="dialog-title">Take a closer look.</h2>
                <div className="review-recipient row">
                  <div className="organisation-icon">
                    <Building2 />
                  </div>
                  <div>
                    <h3>{review.recipient?.organisation}</h3>
                    <span className="small muted">
                      {"Demo identity"}: {review.recipient?.email}
                    </span>
                  </div>
                </div>
                <div className="purpose-box">
                  <span className="eyebrow">STATED PURPOSE</span>
                  <p>{review.purpose}</p>
                  <span className="small muted">
                    Requested duration: {duration(review.durationHours)}
                  </span>
                </div>
                <div className={`guardian-panel ${review.guardian?.risk}`}>
                  <div className="row between">
                    <h3>
                      <ShieldCheck size={20} /> Document Request Guardian
                    </h3>
                    <Badge
                      tone={review.guardian?.risk === "high" ? "rose" : "teal"}
                    >
                      {review.guardian?.risk} risk
                    </Badge>
                  </div>
                  <span className="analysis-label">
                    Rules-based demo analysis
                  </span>
                  <p>{review.guardian?.explanation}</p>
                  {review.guardian?.excessiveFields.length ? (
                    <p>
                      <strong>Potentially excessive:</strong>{" "}
                      {review.guardian.excessiveFields
                        .map((f) => fieldLabels[f])
                        .join(", ")}
                      .
                    </p>
                  ) : null}
                  <p>
                    <strong>Suggested minimum:</strong>{" "}
                    {review.guardian?.suggestedMinimum
                      .map((f) => fieldLabels[f])
                      .join(", ")}
                    . Suggested duration:{" "}
                    {duration(review.guardian?.suggestedDurationHours ?? 24)}.
                  </p>
                  <small>{review.guardian?.advisory}</small>
                </div>
                <fieldset>
                  <legend>Choose exactly what to share</legend>
                  <p className="muted small">
                    Only checked attributes are included. Original documents
                    stay private.
                  </p>
                  {review.fields.map((f) => {
                    const doc = data.documents?.find((d) =>
                      Object.hasOwn(d.attributes, f),
                    );
                    return (
                      <label
                        className={`consent-field ${fields.includes(f) ? "checked" : ""}`}
                        key={f}
                      >
                        <input
                          type="checkbox"
                          checked={fields.includes(f)}
                          disabled={!doc || busy}
                          onChange={(e) =>
                            setFields(
                              e.target.checked
                                ? [...fields, f]
                                : fields.filter((x) => x !== f),
                            )
                          }
                        />
                        <span className="grow">
                          <strong>{fieldLabels[f]}</strong>
                          <small>
                            {doc
                              ? doc.attributes[f]
                              : "Unavailable: no synthetic attribute"}
                          </small>
                        </span>
                        {review.guardian?.excessiveFields.includes(f) ? (
                          <span className="excessive-label">
                            May be unnecessary
                          </span>
                        ) : (
                          <span className="recommended-label">
                            Suggested minimum
                          </span>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
                <div className="row duration-row">
                  <label>
                    Allow access for
                    <input
                      aria-label="Allow access for hours"
                      type="number"
                      min={1}
                      max={Math.min(
                        review.durationHours,
                        data.policy.maxDurationHours,
                      )}
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </label>
                  <span className="muted small">
                    hours · maximum{" "}
                    {Math.min(
                      review.durationHours,
                      data.policy.maxDurationHours,
                    )}{" "}
                    hours
                    <br />
                    You can revoke future access at any time.
                  </span>
                </div>
                <div className="notice info small">
                  <LockKeyhole size={17} />
                  <span>
                    You are approving {fields.length} synthetic attribute
                    {fields.length !== 1 ? "s" : ""}. This is an attribute view,
                    not a redacted PDF.
                  </span>
                </div>
                <div className="row consent-actions">
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => submitConsent("REJECT")}
                  >
                    Reject request
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !fields.length ||
                      hours < 1 ||
                      hours >
                        Math.min(
                          review.durationHours,
                          data.policy.maxDurationHours,
                        )
                    }
                    onClick={() => submitConsent("APPROVE")}
                  >
                    <Check size={17} />
                    {busy
                      ? "Saving consent…"
                      : `Approve ${fields.length} selected attribute${fields.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
            {share && (
              <>
                <span className="eyebrow">{"SIMULATED RECIPIENT ACCESS"}</span>
                <h2 id="dialog-title">Just what was approved.</h2>
                <p className="muted">{share.purpose}</p>
                <Badge tone="teal">{"Demo permission checked"}</Badge>
                <div className="shared-attributes">
                  {Object.entries(share.attributes).map(([k, v]) => (
                    <div key={k}>
                      <span>{fieldLabels[k]}</span>
                      <strong>{v}</strong>
                      <CheckCircle2 size={18} />
                    </div>
                  ))}
                </div>
                <p className="small muted">
                  Access expires {fmt(share.expiresAt)}. The student can revoke
                  future access.
                </p>
                <div className="notice info small">
                  <ShieldCheck size={18} />
                  <span>
                    Only approved synthetic attributes are returned. Original
                    files are never included. This is not a redacted PDF.
                    <br />
                    {share.source}
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ActivityList({ events }: { events: Event[] }) {
  return (
    <div className="panel activity-list">
      {events.length ? (
        events.map((e) => (
          <div className="activity-row" key={e.id}>
            <span
              className={`activity-icon ${e.outcome === "DENIED" ? "denied" : ""}`}
            >
              {e.outcome === "DENIED" ? (
                <X size={17} />
              ) : e.action.startsWith("POLICY") ? (
                <Landmark size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
            </span>
            <div className="grow">
              <strong>{readable(e.action)}</strong>
              <p>{e.detail}</p>
            </div>
            <div className="activity-end">
              <Badge
                tone={
                  e.outcome === "SUCCESS"
                    ? "teal"
                    : e.outcome === "DENIED"
                      ? "rose"
                      : "amber"
                }
              >
                {readable(e.outcome)}
              </Badge>
              <time>{fmt(e.createdAt)}</time>
            </div>
          </div>
        ))
      ) : (
        <Empty
          icon={<Activity />}
          title="A fresh start"
          text="Your decisions and access events will appear here."
        />
      )}
    </div>
  );
}
