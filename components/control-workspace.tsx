"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";

import { apiRequest, type LoginResponse } from "../lib/api";

type Restaurant = {
  id: number;
  name: string;
  slug: string;
  phone: string | null;
  contactEmail: string | null;
  brandColor: string | null;
  isActive: boolean;
  manager: { email: string } | null;
  subscription: { monthlyCharge: number; status: string } | null;
};

type PlatformUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  tenant: {
    id: number;
    name: string;
    slug: string;
    isActive: boolean;
  } | null;
};

type ActivityNotice = {
  id: number;
  tone: "success" | "warning" | "info";
  text: string;
};

const storageKey = "tableflow-control-session";

function formatCurrency(amount: number | null | undefined) {
  return `KES ${Number(amount ?? 0).toLocaleString()}`;
}

function getMessageTone(message: string): "success" | "warning" | "info" {
  const normalized = message.toLowerCase();

  if (normalized.includes("unable") || normalized.includes("failed")) {
    return "warning";
  }

  if (normalized.includes("synced") || normalized.includes("created") || normalized.includes("updated")) {
    return "success";
  }

  return "info";
}

export function ControlWorkspace() {
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [message, setMessage] = useState("Sign in with the platform super admin account.");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [managerFirstName, setManagerFirstName] = useState("");
  const [managerLastName, setManagerLastName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [monthlyCharge, setMonthlyCharge] = useState("15000");
  const [billingDay, setBillingDay] = useState("5");
  const [brandColor, setBrandColor] = useState("#114b5f");
  const [notices, setNotices] = useState<ActivityNotice[]>([]);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);

  function showNotice(text: string, tone: "success" | "warning" | "info") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((current) => [...current.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    }, 3600);
  }

  function startAction(actionKey: string, text: string) {
    setBusyActions((current) => ({ ...current, [actionKey]: true }));
    setMessage(text);
    showNotice(text, "info");
  }

  function finishAction(actionKey: string, text: string, tone: "success" | "warning" | "info") {
    setBusyActions((current) => {
      const next = { ...current };
      delete next[actionKey];
      return next;
    });
    setMessage(text);
    showNotice(text, tone);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored) as LoginResponse & { token: string };
    setSession(parsed);
    setToken(parsed.token);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    startTransition(() => {
      void loadData(token);
    });
  }, [token]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  async function loadData(activeToken: string) {
    try {
      const [tenantData, userData] = await Promise.all([
        apiRequest<Restaurant[]>("/admin/restaurants", {}, activeToken),
        apiRequest<PlatformUser[]>("/admin/users", {}, activeToken)
      ]);

      setRestaurants(tenantData);
      setUsers(userData);
      setMessage("Platform control synced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load platform data.");
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyActions.login) {
      return;
    }
    startAction("login", "Signing in...");

    startTransition(async () => {
      try {
        const login = await apiRequest<LoginResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        if (login.user.role !== "SUPER_ADMIN") {
          throw new Error("This account is not a platform super admin.");
        }

        setSession(login);
        setToken(login.token);
        window.localStorage.setItem(storageKey, JSON.stringify({ ...login, token: login.token }));
        finishAction("login", "Signed in successfully.", "success");
      } catch (error) {
        finishAction("login", error instanceof Error ? error.message : "Sign in failed.", "warning");
      }
    });
  }

  async function createRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (busyActions.createRestaurant) {
      return;
    }

    try {
      startAction("createRestaurant", "Creating tenant...");
      await apiRequest(
        "/admin/restaurants",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            slug,
            phone,
            contactEmail,
            managerFirstName,
            managerLastName,
            managerEmail,
            managerPassword,
            monthlyCharge: Number(monthlyCharge),
            billingDay: Number(billingDay),
            brandColor
          })
        },
        token
      );

      setName("");
      setSlug("");
      setPhone("");
      setContactEmail("");
      setManagerFirstName("");
      setManagerLastName("");
      setManagerEmail("");
      setManagerPassword("");
      await loadData(token);
      finishAction("createRestaurant", "Tenant created successfully.", "success");
    } catch (error) {
      finishAction("createRestaurant", error instanceof Error ? error.message : "Unable to create tenant.", "warning");
    }
  }

  async function toggleUser(userId: number, isActive: boolean) {
    if (!token) {
      return;
    }
    const actionKey = `toggle-user-${userId}`;
    if (busyActions[actionKey]) {
      return;
    }

    try {
      startAction(actionKey, "Updating user access...");
      await apiRequest(
        `/admin/users/${userId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: !isActive })
        },
        token
      );

      await loadData(token);
      finishAction(actionKey, "User status updated.", "success");
    } catch (error) {
      finishAction(actionKey, error instanceof Error ? error.message : "Unable to update user.", "warning");
    }
  }

  function signOut() {
    window.localStorage.removeItem(storageKey);
    setIsMenuOpen(false);
    setSession(null);
    setToken(null);
    setRestaurants([]);
    setUsers([]);
    setMessage("Signed out.");
  }

  if (!session || !token) {
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <div className="auth-brand-inner">
            <div>
              <p className="auth-eyebrow">TableFlow Control</p>
              <h1 className="auth-headline">Platform control for multi-tenant operations.</h1>
              <p className="auth-tagline">
                Onboard restaurants, manage subscriptions, control user access,
                and monitor the full platform from one secure interface.
              </p>
            </div>
            <div className="auth-feature-list">
              <div className="auth-feature">
                <span className="auth-feature-icon">🏢</span>
                <div>
                  <strong>Tenant onboarding</strong>
                  <p>Provision restaurants with manager accounts and billing</p>
                </div>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">👁</span>
                <div>
                  <strong>User governance</strong>
                  <p>Enable or disable access across all tenants instantly</p>
                </div>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">💰</span>
                <div>
                  <strong>Subscription tracking</strong>
                  <p>Monthly charges, billing days, and plan status</p>
                </div>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">🔒</span>
                <div>
                  <strong>Super admin only</strong>
                  <p>Restricted to platform-level administrators</p>
                </div>
              </div>
            </div>
          </div>
          <div className="auth-brand-deco auth-deco-1" />
          <div className="auth-brand-deco auth-deco-2" />
          <div className="auth-brand-deco auth-deco-3" />
        </div>

        <div className="auth-form-side">
          <div className="auth-form-card card">
            <div className="auth-form-head">
              <p className="eyebrow">Platform access</p>
              <h2>Super admin sign in</h2>
              <p className="helper-text">Only super admin accounts can access the control panel.</p>
            </div>

            <div className="quick-fill-grid" style={{ gridTemplateColumns: "1fr" }}>
              {[
                { label: "Super Admin", sub: "0722230603 · pass: 123", phone: "0722230603", pass: "123" },
                { label: "Super Admin (email)", sub: "admin@tableflow.app · pass: Admin@1234", phone: "admin@tableflow.app", pass: "Admin@1234" }
              ].map((preset) => (
                <button
                  key={preset.phone}
                  type="button"
                  className="quick-fill-btn"
                  onClick={() => { setEmail(preset.phone); setPassword(preset.pass); }}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.sub}</small>
                </button>
              ))}
            </div>

            <form className="stack" onSubmit={handleLogin}>
              <label>
                Phone or email
                <input
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="phone number or email"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <button type="submit" disabled={isPending || busyActions.login} className="auth-submit-btn">
                {isPending || busyActions.login ? "Signing in..." : "Enter control panel"}
              </button>
            </form>

            {message !== "Sign in with the platform super admin account." ? (
              <p className="auth-status" data-tone={getMessageTone(message)}>{message}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="page-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">TableFlow Control</p>
          <h1>Platform control web</h1>
          <p className="lede">
            {session.user.firstName} {session.user.lastName} · {session.user.role}
          </p>
        </div>
        <div className="inline-actions">
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="menu-trigger"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label="Open user menu"
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            {isMenuOpen ? (
              <div className="menu-dropdown" role="menu" aria-label="User menu">
                <div className="menu-profile">
                  <strong>{session.user.firstName} {session.user.lastName}</strong>
                  <span>{session.user.role} · Platform control</span>
                  <span>{session.user.email}</span>
                </div>
                <button
                  type="button"
                  className="menu-item-button"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (token) void loadData(token);
                  }}
                  disabled={isPending}
                >
                  {isPending ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  className="menu-item-button menu-item-danger"
                  role="menuitem"
                  onClick={signOut}
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="status-banner" data-tone={getMessageTone(message)} aria-live="polite">
        <div>
          <strong>Platform status</strong>
          <p>{message}</p>
        </div>
        <span className="status-pill">{isPending ? "Refreshing" : "Stable"}</span>
      </section>

      {notices.length ? (
        <section className="activity-stack" aria-live="polite" aria-label="Recent activity">
          {notices.map((notice) => (
            <div key={notice.id} className="activity-toast" data-tone={notice.tone}>
              <strong>{notice.tone === "info" ? "Working" : notice.tone === "success" ? "Success" : "Attention"}</strong>
              <p>{notice.text}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="stat-strip">
        <div className="stat-chip">
          <span>Revenue base</span>
          <strong>{formatCurrency(restaurants.reduce((sum, tenant) => sum + (tenant.subscription?.monthlyCharge ?? 0), 0))} monthly</strong>
        </div>
        <div className="stat-chip">
          <span>Access watch</span>
          <strong>{users.filter((user) => !user.isActive).length} disabled users require review</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {[
          ["Tenants", restaurants.length],
          ["Active Tenants", restaurants.filter((item) => item.isActive).length],
          ["Platform Users", users.length],
          ["Disabled Users", users.filter((item) => !item.isActive).length]
        ].map(([label, value]) => (
          <article key={label} className="card metric-card">
            <span className="meta">{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <article className="card panel">
          <div className="panel-head">
            <h2>Onboard tenant</h2>
            <p>Create a new restaurant, assign its manager, and seed billing settings in one workflow.</p>
          </div>
          <form className="stack" onSubmit={createRestaurant}>
            <label>
              Restaurant name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Slug
              <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} />
            </label>
            <label>
              Phone
              <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label>
              Contact email
              <input type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
            </label>
            <label>
              Manager first name
              <input value={managerFirstName} onChange={(event) => setManagerFirstName(event.target.value)} />
            </label>
            <label>
              Manager last name
              <input value={managerLastName} onChange={(event) => setManagerLastName(event.target.value)} />
            </label>
            <label>
              Manager email
              <input type="email" autoComplete="email" value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} />
            </label>
            <label>
              Manager password
              <input type="password" autoComplete="new-password" value={managerPassword} onChange={(event) => setManagerPassword(event.target.value)} />
            </label>
            <label>
              Monthly charge
              <input inputMode="decimal" value={monthlyCharge} onChange={(event) => setMonthlyCharge(event.target.value)} />
            </label>
            <label>
              Billing day
              <input inputMode="numeric" value={billingDay} onChange={(event) => setBillingDay(event.target.value)} />
            </label>
            <label>
              Brand color
              <input value={brandColor} onChange={(event) => setBrandColor(event.target.value)} />
            </label>
            <button type="submit" disabled={busyActions.createRestaurant}>
              {busyActions.createRestaurant ? "Creating..." : "Create tenant"}
            </button>
          </form>
        </article>

        <article className="card panel wide">
          <div className="panel-head">
            <h2>Tenant customers</h2>
            <p>Review live tenant footprint, account ownership, and subscription positioning.</p>
          </div>
          <div className="compact-list">
            {restaurants.length === 0 ? (
              <div className="empty-state">
                <strong>No tenants yet</strong>
                <p>Use the onboarding form to create the first restaurant account on the platform.</p>
              </div>
            ) : restaurants.map((tenant) => (
              <div key={tenant.id} className="record">
                <div className="inline-actions">
                  <strong>{tenant.name}</strong>
                  <span className="pill">{tenant.isActive ? "Active" : "Disabled"}</span>
                </div>
                <p className="meta">
                  {tenant.slug} · {tenant.manager?.email ?? "No manager"} · {formatCurrency(tenant.subscription?.monthlyCharge ?? 0)}
                </p>
                <p className="meta">
                  {tenant.phone ?? "-"} · {tenant.contactEmail ?? "-"} · {tenant.subscription?.status ?? "No plan"}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="card panel wide">
          <div className="panel-head">
            <h2>System users</h2>
            <p>Inspect account role, tenant assignment, and quickly control access.</p>
          </div>
          <div className="user-list">
            {users.length === 0 ? (
              <div className="empty-state">
                <strong>No platform users found</strong>
                <p>User provisioning records will appear here once onboarding is completed.</p>
              </div>
            ) : users.map((user) => (
              <div key={user.id} className="record">
                <div className="inline-actions">
                  <strong>
                    {user.firstName} {user.lastName}
                  </strong>
                  <span className="pill">{user.role}</span>
                  <span className="pill">{user.isActive ? "Enabled" : "Disabled"}</span>
                </div>
                <p className="meta">
                  {user.email} · {user.tenant?.name ?? "No tenant"} · {user.tenant?.slug ?? "-"}
                </p>
                <div className="inline-actions">
                  <button disabled={busyActions[`toggle-user-${user.id}`]} onClick={() => void toggleUser(user.id, user.isActive)}>
                    {busyActions[`toggle-user-${user.id}`] ? "Saving..." : user.isActive ? "Disable user" : "Enable user"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
