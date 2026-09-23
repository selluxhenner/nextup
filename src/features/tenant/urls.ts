// Where a surface lives, as a URL. Path mode hangs everything off one host (/acme, /admin);
// subdomain mode gives each company its own host - which is why /admin cannot simply link to "/"
// for the landing page: in subdomain mode the admin area *is* a host of its own, and "/" is
// admin's own root. Read the env here and nowhere else.
export function tenantMode(): "subdomain" | "path" {
  return process.env.TENANT_MODE === "subdomain" ? "subdomain" : "path";
}

function origin(host: string): string {
  return `${process.env.PUBLIC_SCHEME ?? "http"}://${host}`;
}

/** The marketing site: the bare domain in subdomain mode, the app root in path mode. */
export function landingUrl(): string {
  return tenantMode() === "subdomain" ? origin(process.env.APP_DOMAIN ?? "localhost") : "/";
}

/** A company's home. Absolute in subdomain mode so it works from admin.<domain>. */
export function companyUrl(slug: string): string {
  return tenantMode() === "subdomain"
    ? origin(`${slug}.${process.env.APP_DOMAIN ?? "localhost"}`)
    : `${origin(process.env.APP_DOMAIN ?? "localhost")}/${slug}`;
}

/** One company's dashboard - the page a visitor should land on when they want to see the product. */
export function dashboardUrl(slug: string): string {
  return tenantMode() === "subdomain" ? `${companyUrl(slug)}/dashboard` : `/${slug}/dashboard`;
}
