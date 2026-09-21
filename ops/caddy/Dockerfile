# Caddy with the hosttech DNS plugin built in.
#
# Why the plugin: serviweb.ch's DNS is at hosttech, and Let's Encrypt will not issue a WILDCARD
# certificate over HTTP-01 - wildcards require the DNS-01 challenge. One wildcard cert for
# *.nextup.serviweb.ch means a company created in /admin is reachable over HTTPS immediately,
# with no per-host issuance.
#
# No hosttech API token? Use Caddyfile.ondemand instead - see docs/DEPLOY.md. That path needs no
# credentials at all and issues a normal cert per subdomain on first visit.
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/hosttech

FROM caddy:2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
