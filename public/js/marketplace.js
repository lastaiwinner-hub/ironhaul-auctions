/* Auction browsing: progressive enhancement, with server-backed prices. */
(() => {
  "use strict";
  const cards = [...document.querySelectorAll("[data-auction-card]")];
  const grid = document.querySelector("[data-auction-grid]");
  const tabs = [...document.querySelectorAll("[data-auction-filter]")];
  const sync = document.querySelector("[data-auction-sync]");
  const empty = document.querySelector("[data-filter-empty]");
  let selected = "all";
  const original = new Map(cards.map((c, i) => [c, i]));
  function filter() {
    if (!grid) return;
    let visible = 0;
    const sorted = [...cards].sort((a, b) =>
      selected === "popular"
        ? Number(b.dataset.bidTotal) - Number(a.dataset.bidTotal)
        : original.get(a) - original.get(b),
    );
    const focused = document.activeElement;
    sorted.forEach((card, index) => {
      const end = Date.parse(card.dataset.endTime);
      const matches =
        selected === "ending"
          ? end > Date.now() && end - Date.now() < 86400000
          : selected === "no-reserve"
            ? card.dataset.reserve === "no"
            : true;
      card.hidden = !matches;
      if (matches) visible++;
      if (grid.children[index] !== card)
        grid.insertBefore(card, grid.children[index] || null);
    });
    if (
      focused &&
      grid.contains(focused) &&
      document.activeElement !== focused &&
      !focused.closest("[hidden]")
    )
      focused.focus({ preventScroll: true });
    if (empty) empty.hidden = visible !== 0;
  }
  tabs.forEach((button) =>
    button.addEventListener("click", () => {
      selected = button.dataset.auctionFilter;
      tabs.forEach((t) => {
        const active = t === button;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-pressed", String(active));
      });
      filter();
    }),
  );
  const items = [...document.querySelectorAll("[data-auction]")];
  if (!items.length) return;
  const slugs = [...new Set(items.map((el) => el.dataset.auction))];
  let timer = null;
  let controller = null;
  const setSync = (text) => {
    if (sync) {
      sync.classList.toggle("is-paused", text.startsWith("Updates paused"));
      sync.replaceChildren();
      const dot = document.createElement("span");
      dot.className = "live-dot";
      sync.append(dot, document.createTextNode(text));
    }
  };
  async function refresh() {
    if (document.hidden || controller) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await fetch(
        "/api/lots/state?slugs=" + encodeURIComponent(slugs.join(",")),
        { signal: controller.signal },
      );
      if (!response.ok) throw Error("Unable to update");
      const state = await response.json();
      if (!state.ok || !Array.isArray(state.lots))
        throw Error("Invalid response");
      state.lots.forEach((lot) =>
        items
          .filter((item) => item.dataset.auction === lot.slug)
          .forEach((item) => {
            const price = item.querySelector("[data-auction-price]");
            const formatted = lot.currentBidFormatted.replace(/\.00$/, "");
            if (price && price.textContent !== formatted) {
              price.textContent = formatted;
              price.classList.remove("bid-flash");
              requestAnimationFrame(() => price.classList.add("bid-flash"));
            }
            const bids = item.querySelector("[data-auction-bids]");
            if (bids) bids.textContent = String(lot.bidCount);
            const caption = item.querySelector("[data-auction-price-caption]");
            if (caption)
              caption.textContent = lot.bidCount
                ? "Current bid"
                : "Opening bid";
            item.dataset.bidTotal = lot.bidCount;
            item.dataset.endTime = lot.endsAt || "";
            const clock = item.querySelector("[data-countdown]");
            if (clock && lot.endsAt)
              clock.dataset.countdown =
                lot.status === "live" ? lot.endsAt : new Date(0).toISOString();
            const live =
              lot.status === "live" &&
              lot.endsAt &&
              Date.parse(lot.endsAt) > Date.now();
            const label = item.querySelector("[data-auction-status]");
            if (label) {
              label.replaceChildren();
              if (live) {
                const dot = document.createElement("span");
                dot.className = "live-dot";
                label.append(dot);
              }
              label.append(
                document.createTextNode(
                  live
                    ? "Live auction"
                    : lot.status === "sold"
                      ? "Sold"
                      : "Auction ended",
                ),
              );
            }
            const link = item.querySelector("[data-auction-link]");
            if (link) {
              link.firstChild.textContent = live
                ? "View & bid"
                : "View listing";
              link.href =
                "/lot/" +
                encodeURIComponent(lot.slug) +
                (live ? "#bidding" : "");
            }
          }),
      );
      filter();
      setSync(
        "Updated " +
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    } catch (error) {
      if (!document.hidden) setSync("Updates paused · refresh to retry");
    } finally {
      clearTimeout(timeout);
      controller = null;
    }
  }
  function start() {
    if (timer) return;
    refresh();
    timer = setInterval(refresh, 15000);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    controller?.abort();
  }
  document.addEventListener("visibilitychange", () =>
    document.hidden ? stop() : start(),
  );
  window.addEventListener("pagehide", stop);
  start();
})();

// A local planning estimate; the sales team confirms the route and final quote.
(() => {
  const form = document.querySelector("[data-mileage-estimator]");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const miles = Number(form.elements.miles.value);
    const rate = Number(form.dataset.rate);
    if (
      !Number.isFinite(miles) ||
      !Number.isFinite(rate) ||
      miles < 1 ||
      miles > 10000
    )
      return;
    form.querySelector("[data-mileage-total]").textContent =
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Math.round(miles * rate * 100) / 100);
  });
})();
