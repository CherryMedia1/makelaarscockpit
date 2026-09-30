/** MakelaarsCockpit — Tailwind CSS v3 preset. Gebruik: presets: [require('./brand/tokens/tailwind.config.js')] en importeer tokens.css. */
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "inkt": "var(--mc-inkt)",
        "petrol": {
          "50": "var(--mc-petrol-50)",
          "100": "var(--mc-petrol-100)",
          "200": "var(--mc-petrol-200)",
          "300": "var(--mc-petrol-300)",
          "400": "var(--mc-petrol-400)",
          "500": "var(--mc-petrol-500)",
          "600": "var(--mc-petrol-600)",
          "700": "var(--mc-petrol-700)",
          "800": "var(--mc-petrol-800)",
          "900": "var(--mc-petrol-900)"
        },
        "baksteen": {
          "50": "var(--mc-baksteen-50)",
          "100": "var(--mc-baksteen-100)",
          "200": "var(--mc-baksteen-200)",
          "300": "var(--mc-baksteen-300)",
          "400": "var(--mc-baksteen-400)",
          "500": "var(--mc-baksteen-500)",
          "600": "var(--mc-baksteen-600)",
          "700": "var(--mc-baksteen-700)",
          "800": "var(--mc-baksteen-800)",
          "900": "var(--mc-baksteen-900)"
        },
        "oker": {
          "50": "var(--mc-oker-50)",
          "100": "var(--mc-oker-100)",
          "200": "var(--mc-oker-200)",
          "300": "var(--mc-oker-300)",
          "400": "var(--mc-oker-400)",
          "500": "var(--mc-oker-500)",
          "600": "var(--mc-oker-600)",
          "700": "var(--mc-oker-700)",
          "800": "var(--mc-oker-800)",
          "900": "var(--mc-oker-900)"
        },
        "zand": "var(--mc-zand)",
        "klei": "var(--mc-klei)",
        "steen": "var(--mc-steen)",
        "wit": "var(--mc-wit)",
        "neutraal": {
          "0": "var(--mc-neutraal-0)",
          "50": "var(--mc-neutraal-50)",
          "100": "var(--mc-neutraal-100)",
          "200": "var(--mc-neutraal-200)",
          "300": "var(--mc-neutraal-300)",
          "400": "var(--mc-neutraal-400)",
          "500": "var(--mc-neutraal-500)",
          "600": "var(--mc-neutraal-600)",
          "700": "var(--mc-neutraal-700)",
          "800": "var(--mc-neutraal-800)",
          "900": "var(--mc-neutraal-900)",
          "950": "var(--mc-neutraal-950)"
        },
        "bg": "var(--mc-color-bg)",
        "surface": "var(--mc-color-surface)",
        "surface-sunken": "var(--mc-color-surface-sunken)",
        "border": "var(--mc-color-border)",
        "border-strong": "var(--mc-color-border-strong)",
        "text": "var(--mc-color-text)",
        "text-muted": "var(--mc-color-text-muted)",
        "text-inverse": "var(--mc-color-text-inverse)",
        "primary": "var(--mc-color-primary)",
        "primary-hover": "var(--mc-color-primary-hover)",
        "primary-subtle": "var(--mc-color-primary-subtle)",
        "on-primary": "var(--mc-color-on-primary)",
        "accent": "var(--mc-color-accent)",
        "accent-strong": "var(--mc-color-accent-strong)",
        "accent-text": "var(--mc-color-accent-text)",
        "accent-subtle": "var(--mc-color-accent-subtle)",
        "on-accent": "var(--mc-color-on-accent)",
        "focus": "var(--mc-color-focus)",
        "highlight": "var(--mc-color-highlight)",
        "succes": {
          "fg": "var(--mc-succes-fg)",
          "bg": "var(--mc-succes-bg)",
          "base": "var(--mc-succes-base)"
        },
        "waarschuwing": {
          "fg": "var(--mc-waarschuwing-fg)",
          "bg": "var(--mc-waarschuwing-bg)",
          "base": "var(--mc-waarschuwing-base)"
        },
        "fout": {
          "fg": "var(--mc-fout-fg)",
          "bg": "var(--mc-fout-bg)",
          "base": "var(--mc-fout-base)"
        },
        "info": {
          "fg": "var(--mc-info-fg)",
          "bg": "var(--mc-info-bg)",
          "base": "var(--mc-info-base)"
        },
        "chart": {
          "1": "var(--mc-chart-1)",
          "2": "var(--mc-chart-2)",
          "3": "var(--mc-chart-3)",
          "4": "var(--mc-chart-4)",
          "5": "var(--mc-chart-5)",
          "6": "var(--mc-chart-6)"
        }
      },
      "fontFamily": {
        "display": [
          "Sora",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "sans": [
          "Figtree",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      },
      "fontSize": {
        "display": [
          "48px",
          {
            "lineHeight": "56px",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "h1": [
          "36px",
          {
            "lineHeight": "44px",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "h2": [
          "28px",
          {
            "lineHeight": "36px",
            "fontWeight": "600",
            "letterSpacing": "-0.015em"
          }
        ],
        "h3": [
          "22px",
          {
            "lineHeight": "30px",
            "fontWeight": "600",
            "letterSpacing": "-0.01em"
          }
        ],
        "h4": [
          "18px",
          {
            "lineHeight": "26px",
            "fontWeight": "600",
            "letterSpacing": "-0.005em"
          }
        ],
        "kpi": [
          "40px",
          {
            "lineHeight": "44px",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "body-lg": [
          "18px",
          {
            "lineHeight": "28px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "body": [
          "16px",
          {
            "lineHeight": "24px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "body-sm": [
          "14px",
          {
            "lineHeight": "20px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "label": [
          "14px",
          {
            "lineHeight": "20px",
            "fontWeight": "500",
            "letterSpacing": "0"
          }
        ],
        "caption": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "500",
            "letterSpacing": "0.01em"
          }
        ],
        "overline": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "600",
            "letterSpacing": "0.08em"
          }
        ]
      },
      "borderRadius": {
        "sm": "6px",
        "md": "10px",
        "lg": "16px",
        "xl": "24px",
        "full": "9999px"
      },
      "boxShadow": {
        "sm": "0 1px 2px rgba(20,32,43,0.06)",
        "md": "0 4px 12px rgba(20,32,43,0.08)",
        "lg": "0 12px 32px rgba(20,32,43,0.12)"
      }
    }
  }
};
