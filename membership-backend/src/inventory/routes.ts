import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requireStaffAuth } from "../middleware/staff-auth.middleware.js";
import { costingService } from "../costing/routes.js";
import { CostingError, id } from "../costing/validation.js";
import type { Scope } from "../costing/service.js";
import { InventoryService } from "./service.js";
export const inventoryService = new InventoryService(costingService);
export function createInventoryRouter(service: InventoryService) {
  const root = Router();
  root.use(requireStaffAuth);
  const wrap =
    (fn: (req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({ success: true, data: await fn(req) });
      } catch (error) {
        next(error);
      }
    };
  root.get(
    "/context",
    wrap((req) => service.costing.context(id(req.staff?.staffUserId))),
  );
  const scoped = Router({ mergeParams: true });
  const scope = (req: Request): Scope => ({
    brandId: id(req.params.brandId),
    locationId: id(req.params.locationId),
    staffId: id(req.staff?.staffUserId),
  });
  scoped.get(
    "/imports/template",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const buffer = await service.downloadTemplate(scope(req));
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="inventory-price-update.xlsx"',
        );
        res.setHeader("Cache-Control", "no-store");
        res.send(buffer);
      } catch (error) {
        next(error);
      }
    },
  );
  scoped.post(
    "/imports/parse",
    express.raw({
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      limit: "3mb",
      inflate: false,
    }),
    wrap((req) => {
      if (!Buffer.isBuffer(req.body))
        throw new CostingError(422, "Please upload an .xlsx file.");
      return service.parse(scope(req), req.body);
    }),
  );
  scoped.use(express.json({ limit: "2mb", inflate: false }));
  scoped.use((req, res, next) => {
    if (
      ["POST", "PATCH"].includes(req.method) &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    ) {
      res.status(422).json({
        success: false,
        message: "Please provide a valid JSON object.",
      });
      return;
    }
    next();
  });
  scoped.get(
    "/items",
    wrap((req) => service.list(scope(req))),
  );
  scoped.post(
    "/items",
    wrap((req) => service.create(scope(req), req.body)),
  );
  scoped.get(
    "/items/:id",
    wrap((req) => service.detail(scope(req), id(req.params.id))),
  );
  scoped.patch(
    "/items/:id",
    wrap((req) => service.settings(scope(req), id(req.params.id), req.body)),
  );
  scoped.post(
    "/items/:id/archive",
    wrap((req) => service.archive(scope(req), id(req.params.id), req.body)),
  );
  scoped.post(
    "/items/:id/movements",
    wrap((req) => service.move(scope(req), id(req.params.id), req.body)),
  );
  scoped.get(
    "/movements",
    wrap((req) => service.history(scope(req))),
  );
  scoped.post(
    "/imports/preview",
    wrap((req) => service.preview(scope(req), req.body)),
  );
  scoped.post(
    "/imports/:id/confirm",
    wrap((req) => service.confirm(scope(req), id(req.params.id), req.body)),
  );
  root.use("/brands/:brandId/locations/:locationId", scoped);
  root.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof CostingError) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({
        success: false,
        message:
          "The upload is too large. Split the data into smaller files (maximum 3MB per workbook).",
      });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ success: false, message: "Invalid JSON format." });
      return;
    }
    if (error?.code === "ER_DUP_ENTRY") {
      res.status(409).json({
        success: false,
        message:
          "This code, material link or request already exists. Refresh and check the record.",
      });
      return;
    }
    console.error("Local inventory request failed.");
    res.status(500).json({
      success: false,
      message: "Inventory operation failed. Please try again.",
    });
  });
  return root;
}
export default createInventoryRouter(inventoryService);
