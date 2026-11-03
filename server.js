
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Isi melalui Environment Variables di Render.
const SFL_HOSTS = (process.env.SFL_HOSTS || "")
  .split(",")
  .map(x => x.trim().toLowerCase())
  .filter(Boolean);

const REDIRECT_HOSTS = (process.env.REDIRECT_HOSTS || "")
  .split(",")
  .map(x => x.trim().toLowerCase())
  .filter(Boolean);

app.use(express.json({ limit: "5kb" }));
app.use(express.static(__dirname));

function allowedHost(host) {
  host = host.toLowerCase();

  const allowed = [...SFL_HOSTS, ...REDIRECT_HOSTS];

  return allowed.some(domain =>
    host === domain || host.endsWith("." + domain)
  ) || host === "mediafire.com" ||
       host.endsWith(".mediafire.com");
}

function isMediaFire(host) {
  host = host.toLowerCase();
  return host === "mediafire.com" ||
         host.endsWith(".mediafire.com");
}

function validUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;

    return url;
  } catch {
    return null;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "online", app: "BYPASS" });
});

app.post("/api/extract", async (req, res) => {
  try {
    const input = validUrl(req.body?.url);

    if (!input) {
      return res.status(400).json({
        error: "Link HTTPS tidak valid."
      });
    }

    if (!SFL_HOSTS.some(domain =>
      input.hostname === domain ||
      input.hostname.endsWith("." + domain)
    )) {
      return res.status(403).json({
        error: "Domain SFL belum diizinkan."
      });
    }

    let current = input;

    for (let i = 0; i < 8; i++) {
      if (!allowedHost(current.hostname)) {
        return res.status(403).json({
          error: "Redirect menuju domain yang tidak diizinkan."
        });
      }

      const response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "BYPASS-Link-Checker/1.0",
          "Accept": "text/html,*/*"
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw new Error("Alamat redirect kosong.");
        }

        const next = validUrl(new URL(location, current).href);

        if (!next) {
          throw new Error("Redirect bukan HTTPS yang valid.");
        }

        current = next;
        continue;
      }

      if (isMediaFire(current.hostname)) {
        return res.json({
          success: true,
          destinationUrl: current.href
        });
      }

      return res.status(422).json({
        error: "MediaFire belum ditemukan melalui redirect HTTP."
      });
    }

    return res.status(422).json({
      error: "Batas redirect tercapai."
    });

  } catch (error) {
    console.error("Extractor error:", error.message);

    return res.status(500).json({
      error: "Gagal memeriksa link. Periksa koneksi atau proteksi situs."
    });
  }
});

app.listen(PORT, () => {
  console.log("BYPASS server aktif di port " + PORT);
});
