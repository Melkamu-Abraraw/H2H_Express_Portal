import { issuePass, Rejected } from "@/lib/server/requests";

// POST /api/captcha: swaps a ticked reCAPTCHA box for a pass that lasts while the form is filled in.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  try {
    return Response.json({ success: true, pass: await issuePass(body?.token) });
  } catch (error) {
    if (error instanceof Rejected) {
      return Response.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("reCAPTCHA check failed", error);
    return Response.json({ success: false, error: "The check failed. Please try again." }, { status: 500 });
  }
}
