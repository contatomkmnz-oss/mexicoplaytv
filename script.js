const popup = document.getElementById("vip-popup");
const openBtn = document.getElementById("open-vip-popup");
const closeBtn = document.getElementById("close-vip-popup");

function openPopup() {
  if (!popup) return;
  popup.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePopup() {
  if (!popup) return;
  popup.hidden = true;
  document.body.style.overflow = "";
}

if (openBtn) openBtn.addEventListener("click", openPopup);
if (closeBtn) closeBtn.addEventListener("click", closePopup);

if (popup) {
  popup.addEventListener("click", (event) => {
    if (event.target === popup) closePopup();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePopup();
});

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothScrollTo(el) {
  const start = window.pageYOffset;
  const end = el.getBoundingClientRect().top + start - 8;
  const distance = end - start;
  const duration = Math.min(1200, Math.max(500, Math.abs(distance) * 0.55));
  const startTime = performance.now();

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

document.querySelectorAll('a[href="#comprar"], a[href="#oferta"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = document.getElementById("comprar") || document.getElementById("oferta");
    if (!target) return;
    smoothScrollTo(target);
  });
});

/* —— UTM persistence → checkout —— */
(function initUtmPersistence() {
  const STORAGE_KEY = "mexicoplay_tracking_params";
  const EXP_DAYS = 7;
  const TRACKING_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "utm_id",
    "src",
    "sck",
    "xcod",
    "fbclid",
    "gclid",
    "gbraid",
    "wbraid",
    "ttclid",
    "tbclid",
    "cid",
    "click_id",
  ];
  const CHECKOUT_HOSTS = ["pay.wiapy.com"];

  function isValidValue(value) {
    return (
      value != null &&
      value !== "" &&
      value !== "null" &&
      value !== "undefined"
    );
  }

  function readFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const out = {};
    TRACKING_KEYS.forEach((key) => {
      const value = params.get(key);
      if (isValidValue(value)) out[key] = value;
    });
    return out;
  }

  function readFromUtmifyStorage() {
    const out = {};
    TRACKING_KEYS.forEach((key) => {
      try {
        const value = localStorage.getItem(key);
        const exp = localStorage.getItem(`${key}_exp`);
        if (!isValidValue(value)) return;
        if (exp && new Date(exp) < new Date()) {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_exp`);
          return;
        }
        out[key] = value;
      } catch (_) {
        /* ignore */
      }
    });
    return out;
  }

  function readBundle() {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ||
        sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      if (parsed.exp && new Date(parsed.exp) < new Date()) {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        return {};
      }
      return parsed.params && typeof parsed.params === "object"
        ? parsed.params
        : {};
    } catch (_) {
      return {};
    }
  }

  function saveBundle(params) {
    if (!Object.keys(params).length) return;
    const payload = JSON.stringify({
      params,
      exp: new Date(
        Date.now() + EXP_DAYS * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
    try {
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (_) {
      /* ignore */
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, payload);
    } catch (_) {
      /* ignore */
    }

    // Keep UTMify-compatible keys in sync
    const expIso = new Date(
      Date.now() + EXP_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    Object.entries(params).forEach(([key, value]) => {
      if (!isValidValue(value)) return;
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(`${key}_exp`, expIso);
      } catch (_) {
        /* ignore */
      }
    });
  }

  function mergeParams() {
    // Priority: current URL > UTMify keys > our bundle
    return {
      ...readBundle(),
      ...readFromUtmifyStorage(),
      ...readFromUrl(),
    };
  }

  function syncUrl(params) {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      Object.entries(params).forEach(([key, value]) => {
        if (!isValidValue(value)) return;
        if (url.searchParams.get(key) !== value) {
          url.searchParams.set(key, value);
          changed = true;
        }
      });
      if (changed) {
        history.replaceState(history.state, "", url.toString());
      }
    } catch (_) {
      /* ignore */
    }
  }

  function appendParams(urlString, params) {
    const url = new URL(urlString, window.location.href);
    Object.entries(params).forEach(([key, value]) => {
      if (!isValidValue(value)) return;
      url.searchParams.set(key, value);
    });
    return url.toString();
  }

  function isCheckoutUrl(href) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }
    try {
      const url = new URL(href, window.location.href);
      return CHECKOUT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch (_) {
      return false;
    }
  }

  function getBaseCheckoutHref(anchor) {
    if (!anchor.dataset.utmBaseHref) {
      const current = anchor.getAttribute("href") || "";
      try {
        const url = new URL(current, window.location.href);
        // Keep path/id of checkout; strip previous tracking query for clean re-apply
        TRACKING_KEYS.forEach((key) => url.searchParams.delete(key));
        anchor.dataset.utmBaseHref = url.toString();
      } catch (_) {
        anchor.dataset.utmBaseHref = current;
      }
    }
    return anchor.dataset.utmBaseHref;
  }

  function decorateCheckoutLinks(params) {
    document.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!isCheckoutUrl(href) && !isCheckoutUrl(anchor.dataset.utmBaseHref || "")) {
        return;
      }
      const base = getBaseCheckoutHref(anchor);
      if (!isCheckoutUrl(base)) return;
      anchor.href = appendParams(base, params);
    });
  }

  function applyTracking() {
    const params = mergeParams();
    if (Object.keys(params).length) {
      saveBundle(params);
      syncUrl(params);
    }
    decorateCheckoutLinks(params);
    return params;
  }

  let tracking = applyTracking();

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!isCheckoutUrl(href) && !isCheckoutUrl(anchor.dataset.utmBaseHref || "")) {
        return;
      }
      tracking = applyTracking();
      const base = getBaseCheckoutHref(anchor);
      anchor.href = appendParams(base, tracking);
    },
    true
  );

  // Re-apply after UTMify finishes rewriting links
  [500, 1500, 3000, 5000].forEach((ms) => {
    setTimeout(() => {
      tracking = applyTracking();
    }, ms);
  });

  window.MexicoPlayTracking = {
    getParams: () => ({ ...mergeParams() }),
    apply: applyTracking,
  };
})();
