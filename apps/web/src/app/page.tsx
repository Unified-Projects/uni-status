import { redirect } from "next/navigation";
import { auth } from "@uni-status/auth";
import { headers } from "next/headers";

export default async function HomePage() {
    // If a public landing site is configured, send users there instead of
    // forcing the dashboard fallback.
    const landingUrl =
        process.env.LANDING_URL || process.env.NEXT_PUBLIC_LANDING_URL;
    if (landingUrl) {
        try {
            const currentHost = (await headers()).get("host");
            const landing = new URL(landingUrl);
            const isSameHost = currentHost && landing.host === currentHost;

            // Avoid redirect loops when HAProxy has already fallen back to the web app
            if (!isSameHost) {
                redirect(landingUrl);
            }
        } catch {
            // If parsing fails, ignore and continue to dashboard fallback logic
        }
    }

    // When landing isn't available, fall back to dashboard (if logged in)
    // or the login page.
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (session?.user) {
        redirect("/dashboard");
    } else {
        redirect("/login");
    }
}
