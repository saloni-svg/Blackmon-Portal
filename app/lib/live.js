// Live updates for the portal (Server-Sent Events on /api/events). When an admin posts or edits an
// announcement, edits Camp info or This week, or closes a parent's chat, every signed-in parent page
// is told what changed and reloads just that, so nobody has to refresh. One server instance, so the
// open connections are simply kept here.

export function createLive() {
  const clients = new Set(); // { res, contactId }
  // A comment line every 25 seconds keeps idle connections open through the host's proxy.
  setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 25_000).unref();

  return {
    connect(req, res, contactId) {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 5000\n\n");
      const c = { res, contactId };
      clients.add(c);
      req.on("close", () => clients.delete(c));
    },
    // what: "content" (Camp info / This week), "announcements" or "chat"; to: one contact id, or everyone.
    send(what, to = null) {
      const msg = `event: change\ndata: ${JSON.stringify({ what })}\n\n`;
      for (const c of clients) if (!to || c.contactId === to) c.res.write(msg);
    },
    // Ends a parent's open connections (signed out or removed).
    drop(contactId) {
      for (const c of clients) if (c.contactId === contactId) { c.res.end(); clients.delete(c); }
    },
  };
}
