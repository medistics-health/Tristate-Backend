/**
 * Standard branded email layout wrapper for all Prefunding emails,
 * matching the exact CRM invoice email layout (header logo, styling, footer contact info).
 */

export function wrapPrefundingEmailLayout({
  title,
  subtitle,
  preheader,
  contentHtml,
  invoiceNumber,
}: {
  title: string;
  subtitle?: string;
  preheader?: string;
  contentHtml: string;
  invoiceNumber?: string;
}): string {
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${title}</title>

    <!--[if !mso]><!-- -->
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap"
    />
    <!--<![endif]-->

    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      body,
      table,
      td,
      p,
      a,
      h1,
      h2,
      h3,
      span {
        font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
      }

      .email-bg {
        background-color: #eef4f8;
      }

      .email-card {
        background-color: #ffffff;
        border: 1px solid #d7e3ef;
        border-radius: 20px;
      }

      .brand-header {
        background: #ffffff;
      }

      .title {
        color: #0f2d46;
      }

      .text {
        color: #3f556b;
      }

      .btn {
        background-color: #0f4c81;
        border: 1px solid #0f4c81;
        border-radius: 10px;
        color: #ffffff !important;
        display: inline-block;
        font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 14px;
        font-weight: 700;
        line-height: 20px;
        padding: 12px 28px;
        text-decoration: none;
      }

      .contact-link {
        color: #0f4c81 !important;
        text-decoration: none;
      }

      @media only screen and (max-width: 640px) {
        .container {
          width: 100% !important;
        }

        .content-padding {
          padding: 20px !important;
        }

        .header-padding {
          padding: 20px 16px !important;
        }
      }
    </style>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background-color: #eef4f8;
      font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
    "
  >
    ${
      preheader
        ? `<!-- Preheader text -->
    <div
      style="
        display: none;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        mso-hide: all;
        color: transparent;
      "
    >
      ${preheader}
    </div>`
        : ""
    }

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      class="email-bg"
      style="width: 100%; background-color: #eef4f8; margin: 0; padding: 0;"
    >
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <!-- Main Card -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            class="container email-card"
            style="
              width: 100%;
              max-width: 680px;
              background-color: #ffffff;
              border: 1px solid #d7e3ef;
              border-radius: 20px;
              overflow: hidden;
            "
          >
            <!-- ===== HEADER ===== -->
            <tr>
              <td
                class="brand-header header-padding"
                align="center"
                style="
                  padding: 28px 24px 20px 24px;
                  background-color: #ffffff;
                  border-bottom: 1px solid #eef3f8;
                  border-radius: 20px 20px 0 0;
                "
              >
                <!-- Logo container -->
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  align="center"
                  style="margin: 0 auto 14px auto;"
                >
                  <tr>
                    <td
                      style="
                        background-color: #ffffff;
                        border-radius: 14px;
                        padding: 8px 14px;
                      "
                    >
                      <img
                        src="https://tristatemso.com/wp-content/uploads/tristate-health-mso-logo.png"
                        alt="Tristate MSO"
                        width="210"
                        class="logo-img"
                        style="
                          display: block;
                          width: 210px;
                          max-width: 100%;
                          height: auto;
                          border: 0;
                        "
                      />
                    </td>
                  </tr>
                </table>

                <p
                  style="
                    margin: 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 13px;
                    line-height: 20px;
                    color: #0f4c81;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-weight: 700;
                  "
                >
                  ${title}
                </p>

                ${
                  subtitle
                    ? `<p
                  style="
                    margin: 4px 0 0 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 13px;
                    line-height: 20px;
                    color: #5f7387;
                  "
                >
                  ${subtitle}
                </p>`
                    : ""
                }
              </td>
            </tr>

            <!-- ===== BODY ===== -->
            <tr>
              <td
                class="content-padding"
                style="padding: 28px 30px 24px 30px;"
              >
                ${contentHtml}
              </td>
            </tr>

            <!-- ===== FOOTER CONTACT INFO ===== -->
            <tr>
              <td
                align="center"
                style="
                  padding: 20px 24px;
                  background-color: #f8fbfe;
                  border-top: 1px solid #dbe8f3;
                  text-align: center;
                "
              >
                <p
                  class="footer-title"
                  style="
                    margin: 0 0 8px 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 14px;
                    line-height: 20px;
                    color: #0f2d46;
                    font-weight: 700;
                  "
                >
                  Tristate MSO
                </p>

                <p
                  style="
                    margin: 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 12px;
                    line-height: 20px;
                    color: #5f7387;
                  "
                >
                  <a
                    href="mailto:info@tristatemso.com"
                    class="contact-link"
                    style="color: #0f4c81; text-decoration: none;"
                  >
                    info@tristatemso.com
                  </a>
                  <br />
                  <a
                    href="tel:+19083406110"
                    class="contact-link"
                    style="color: #0f4c81; text-decoration: none;"
                  >
                    (908) 340-6110
                  </a>
                  &nbsp;|&nbsp;
                  <a
                    href="tel:+19083406122"
                    class="contact-link"
                    style="color: #0f4c81; text-decoration: none;"
                  >
                    (908) 340-6122
                  </a>
                  <br />
                  155 Willowbrook Blvd, Ste 110 #3408 Wayne, NJ 07470
                </p>
              </td>
            </tr>
          </table>

          <!-- Sub-footer note -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            class="container"
            style="width: 100%; max-width: 680px;"
          >
            <tr>
              <td
                align="center"
                style="
                  padding: 16px 12px 6px 12px;
                  font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                  font-size: 11px;
                  line-height: 18px;
                  color: #8da0b5;
                "
              >
                &copy; ${currentYear} Tristate MSO. All rights reserved.<br />
                ${
                  invoiceNumber
                    ? `This email was sent regarding Prefunding Invoice ${invoiceNumber}.`
                    : "This email contains important information regarding your account."
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
