import axios from "axios";

let cachedLogoBuffer: Buffer | null = null;

/**
 * Fetches the Tristate MSO logo image and caches it in memory to avoid repeated network requests.
 */
export async function getLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogoBuffer) {
    return cachedLogoBuffer;
  }
  try {
    const response = await axios.get("https://tristatemso.com/wp-content/uploads/tristate-health-mso-logo.png", {
      responseType: "arraybuffer",
      timeout: 5000,
    });
    cachedLogoBuffer = Buffer.from(response.data);
    return cachedLogoBuffer;
  } catch (err) {
    console.error("Failed to fetch logo from URL:", err);
    return null;
  }
}
