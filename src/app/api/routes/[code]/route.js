import { requireAccess } from "@/lib/server/auth";
import { getConfig, InvalidRoute, isBuiltIn, isRouteCode, parseRates, parseRoute } from "@/lib/server/config";
import { getDb } from "@/lib/server/mongodb";

function failed(error, status = 400, field) {
  return Response.json({ success: false, error, ...(field && { field }) }, { status });
}

// PUT /api/routes/:code: { route?, rates?, previousCode?, isNew? }
//   route: the route as edited on the Routes page (built-in routes keep everything but branches)
//   rates: { normal, express } price per kg, or null to clear them
//   previousCode: an added route whose countries changed, so it moves to the new code
//   isNew: true when adding a route, so an existing one with the same countries isn't replaced
// Returns the whole updated config so every page sees the same thing.
export async function PUT(request, { params }) {
  const access = await requireAccess("routes.manage");
  if (access.denied) return access.denied;
  const { code } = await params;
  if (!isRouteCode(code)) return failed("Route not found", 404);

  const body = await request.json().catch(() => null);
  const routeSet = {};
  const routeUnset = {};
  const rateSet = {};
  const rateUnset = {};
  try {
    if (body?.route !== undefined) {
      const parsed = parseRoute(code, body.route);
      if (parsed.builtIn) routeSet[`edits.${code}`] = parsed.edit;
      else routeSet[`custom.${code}`] = parsed.route;
    }
    if (body?.rates !== undefined) {
      const rates = parseRates(body.rates);
      if (rates) rateSet[`rates.${code}`] = rates;
      else rateUnset[`rates.${code}`] = "";
    }
  } catch (error) {
    if (error instanceof InvalidRoute) return failed(error.message, 400, error.field);
    throw error;
  }

  const previous = body?.previousCode;
  if (previous !== undefined && previous !== code) {
    if (!isRouteCode(previous) || isBuiltIn(previous) || isBuiltIn(code)) return failed("That route can't be renamed");
    routeUnset[`custom.${previous}`] = "";
    rateUnset[`rates.${previous}`] = "";
  }

  try {
    const db = await getDb();
    const settings = db.collection("settings");
    // A new added route, or one moved to new countries, mustn't overwrite a route already there.
    const claimsCode = body?.isNew === true || (previous !== undefined && previous !== code);
    if (!isBuiltIn(code) && body?.route !== undefined && claimsCode) {
      const config = await getConfig(db);
      if (config.routes.custom[code]) return failed("This route already exists.", 409, "to");
    }
    const stamp = { updatedAt: new Date(), updatedBy: access.user.name };
    if (Object.keys(routeSet).length || Object.keys(routeUnset).length) {
      await settings.updateOne(
        { _id: "routes" },
        { $set: { ...routeSet, ...stamp }, ...(Object.keys(routeUnset).length && { $unset: routeUnset }) },
        { upsert: true },
      );
    }
    if (Object.keys(rateSet).length || Object.keys(rateUnset).length) {
      await settings.updateOne(
        { _id: "rates" },
        { $set: { ...rateSet, ...stamp }, ...(Object.keys(rateUnset).length && { $unset: rateUnset }) },
        { upsert: true },
      );
    }
    return Response.json({ success: true, ...(await getConfig(db)) });
  } catch (error) {
    console.error("Saving route failed", error);
    return failed("Couldn't save the route", 500);
  }
}

// DELETE /api/routes/:code: removes an added route and its prices. Built-in routes stay.
export async function DELETE(request, { params }) {
  const access = await requireAccess("routes.manage");
  if (access.denied) return access.denied;
  const { code } = await params;
  if (!isRouteCode(code)) return failed("Route not found", 404);
  if (isBuiltIn(code)) return failed("Built-in routes can't be removed", 409);
  try {
    const db = await getDb();
    const settings = db.collection("settings");
    const stamp = { updatedAt: new Date(), updatedBy: access.user.name };
    await settings.updateOne({ _id: "routes" }, { $unset: { [`custom.${code}`]: "" }, $set: stamp }, { upsert: true });
    await settings.updateOne({ _id: "rates" }, { $unset: { [`rates.${code}`]: "" }, $set: stamp }, { upsert: true });
    return Response.json({ success: true, ...(await getConfig(db)) });
  } catch (error) {
    console.error("Removing route failed", error);
    return failed("Couldn't remove the route", 500);
  }
}
