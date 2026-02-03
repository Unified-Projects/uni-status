import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Status colors - themeable via CSS variables
        status: {
          success: {
            solid: "var(--status-success-solid)",
            "solid-hover": "var(--status-success-solid-hover)",
            bg: "var(--status-success-bg)",
            "bg-subtle": "var(--status-success-bg-subtle)",
            text: "var(--status-success-text)",
            border: "var(--status-success-border)",
            icon: "var(--status-success-icon)",
          },
          warning: {
            solid: "var(--status-warning-solid)",
            "solid-hover": "var(--status-warning-solid-hover)",
            bg: "var(--status-warning-bg)",
            "bg-subtle": "var(--status-warning-bg-subtle)",
            text: "var(--status-warning-text)",
            border: "var(--status-warning-border)",
            icon: "var(--status-warning-icon)",
          },
          error: {
            solid: "var(--status-error-solid)",
            "solid-hover": "var(--status-error-solid-hover)",
            bg: "var(--status-error-bg)",
            "bg-subtle": "var(--status-error-bg-subtle)",
            text: "var(--status-error-text)",
            border: "var(--status-error-border)",
            icon: "var(--status-error-icon)",
          },
          info: {
            solid: "var(--status-info-solid)",
            "solid-hover": "var(--status-info-solid-hover)",
            bg: "var(--status-info-bg)",
            "bg-subtle": "var(--status-info-bg-subtle)",
            text: "var(--status-info-text)",
            border: "var(--status-info-border)",
            icon: "var(--status-info-icon)",
          },
          orange: {
            solid: "var(--status-orange-solid)",
            "solid-hover": "var(--status-orange-solid-hover)",
            bg: "var(--status-orange-bg)",
            "bg-subtle": "var(--status-orange-bg-subtle)",
            text: "var(--status-orange-text)",
            border: "var(--status-orange-border)",
            icon: "var(--status-orange-icon)",
          },
          gray: {
            solid: "var(--status-gray-solid)",
            "solid-hover": "var(--status-gray-solid-hover)",
            bg: "var(--status-gray-bg)",
            "bg-subtle": "var(--status-gray-bg-subtle)",
            text: "var(--status-gray-text)",
            border: "var(--status-gray-border)",
            icon: "var(--status-gray-icon)",
          },
          purple: {
            solid: "var(--status-purple-solid)",
            "solid-hover": "var(--status-purple-solid-hover)",
            bg: "var(--status-purple-bg)",
            "bg-subtle": "var(--status-purple-bg-subtle)",
            text: "var(--status-purple-text)",
            border: "var(--status-purple-border)",
            icon: "var(--status-purple-icon)",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "fade-in": "fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "scale-up": "scaleUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "slide-in-left": "slideInLeft 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "slide-in-right": "slideInRight 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "slide-in-bottom": "slideInBottom 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "slide-in-top": "slideInTop 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "float": "float 6s ease-in-out infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "bounce-gentle": "bounceGentle 0.6s ease-out",
        "shake": "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)",
        "shimmer": "shimmer 2s infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleUp: {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInBottom: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInTop: {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.2)" },
          "100%": { boxShadow: "0 0 40px hsl(var(--primary) / 0.4)" },
        },
        bounceGentle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-5px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(5px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      transitionTimingFunction: {
        "smooth-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        "snappy": "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "gentle": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
        "350": "350ms",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
