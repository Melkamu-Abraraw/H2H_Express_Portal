import { redirect } from "next/navigation";

// This page only sends visitors on to the admin, so there is nothing to show instantly; without
// this, development mode tries to validate it and reports the redirect as an error.
export const instant = false;

export default function Home() {
  redirect("/admin");
}
