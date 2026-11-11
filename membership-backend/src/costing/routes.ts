import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requireStaffAuth } from "../middleware/staff-auth.middleware.js";
import { costingDb } from "./db.js";
import { CostingService, type Scope } from "./service.js";
import { CostingError, id } from "./validation.js";
export const costingService = new CostingService(costingDb);
export function createCostingRouter(costingService: CostingService) {
  const root = Router();
  root.use(requireStaffAuth);
  root.use((req, res, next) => {
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    ) {
      res
        .status(422)
        .json({ success: false, message: "Supply a JSON object." });
      return;
    }
    next();
  });
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
    wrap((req) => costingService.context(id(req.staff?.staffUserId))),
  );
  const scope = (req: Request): Scope => ({
    brandId: id(req.params.brandId),
    locationId: id(req.params.locationId),
    staffId: id(req.staff?.staffUserId),
  });
  const scoped = Router({ mergeParams: true });
  for (const [url, resource] of Object.entries({
    materials: "materials",
    sizes: "sizes",
    recipes: "drink_recipes",
    "option-groups": "option_groups",
    options: "options",
    products: "products",
    staff: "staff",
    access: "staff_access",
  })) {
    scoped.get(
      `/${url}`,
      wrap((req) => costingService.list(scope(req), resource, req.query)),
    );
  }
  scoped.post(
    "/materials",
    wrap((req) => costingService.saveMaterial(scope(req), req.body)),
  );
  scoped.get(
    "/materials/:id",
    wrap((req) => costingService.materialDetail(scope(req), id(req.params.id))),
  );
  scoped.patch(
    "/materials/:id",
    wrap((req) =>
      costingService.saveMaterial(scope(req), req.body, id(req.params.id)),
    ),
  );
  scoped.post(
    "/materials/:id/prices",
    wrap((req) =>
      costingService.addPrice(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.post(
    "/materials/:id/preparation",
    wrap((req) =>
      costingService.savePreparation(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.post(
    "/materials/:id/yields",
    wrap((req) =>
      costingService.addYield(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.put(
    "/materials/:id/standard-yield",
    wrap((req) =>
      costingService.selectYield(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.get(
    "/materials/:id/dependents",
    wrap((req) => costingService.dependents(scope(req), id(req.params.id))),
  );
  scoped.post(
    "/materials/:id/archive",
    wrap((req) =>
      costingService.archive(
        scope(req),
        "materials",
        id(req.params.id),
        req.body,
      ),
    ),
  );
  for (const [url, resource] of Object.entries({
    sizes: "sizes",
    recipes: "drink_recipes",
    "option-groups": "option_groups",
    options: "options",
  })) {
    scoped.post(
      `/${url}`,
      wrap((req) =>
        costingService.createSimple(scope(req), resource, req.body),
      ),
    );
    if (resource !== "drink_recipes")
      scoped.patch(
        `/${url}/:id`,
        wrap((req) =>
          costingService.renameLibrary(
            scope(req),
            resource,
            id(req.params.id),
            req.body,
          ),
        ),
      );
  }
  scoped.get(
    "/recipes/:id",
    wrap((req) => costingService.recipeDetail(scope(req), id(req.params.id))),
  );
  scoped.patch(
    "/recipes/:id",
    wrap((req) =>
      costingService.rename(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.post(
    "/recipes/:id/archive",
    wrap((req) =>
      costingService.archive(
        scope(req),
        "drink_recipes",
        id(req.params.id),
        req.body,
      ),
    ),
  );
  scoped.post(
    "/recipes/:id/variants",
    wrap((req) =>
      costingService.saveVariant(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.patch(
    "/recipes/:id/variants/:variantId",
    wrap((req) =>
      costingService.saveVariant(
        scope(req),
        id(req.params.id),
        req.body,
        id(req.params.variantId),
      ),
    ),
  );
  scoped.post(
    "/variants/:id/revisions",
    wrap((req) =>
      costingService.saveRecipeLines(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.get(
    "/variants/:id/options",
    wrap((req) => costingService.variantOptions(scope(req), id(req.params.id))),
  );
  scoped.post(
    "/variants/:id/options",
    wrap((req) =>
      costingService.saveVariantOption(scope(req), id(req.params.id), req.body),
    ),
  );
  scoped.delete(
    "/variants/:id/options/:attachmentId",
    wrap((req) =>
      costingService.removeVariantOption(
        scope(req),
        id(req.params.id),
        id(req.params.attachmentId),
      ),
    ),
  );
  scoped.get(
    "/variants/:id/cost",
    wrap((req) => costingService.cost(scope(req), id(req.params.id))),
  );
  scoped.post(
    "/variants/:id/cost-preview",
    wrap((req) => costingService.cost(scope(req), id(req.params.id), req.body)),
  );
  scoped.get(
    "/profitability",
    wrap((req) => costingService.profitability(scope(req))),
  );
  scoped.get(
    "/audit",
    wrap((req) => costingService.history(scope(req))),
  );
  scoped.post(
    "/access",
    wrap((req) => costingService.access(scope(req), req.body)),
  );
  root.use("/brands/:brandId/locations/:locationId", scoped);
  root.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof CostingError) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    if (error?.code === "ER_DUP_ENTRY") {
      res
        .status(409)
        .json({
          success: false,
          message: "This code, size or mapping already exists.",
        });
      return;
    }
    // Never log SQL, request bodies or database connection details.
    console.error("Recipe Costing request failed.");
    res
      .status(500)
      .json({
        success: false,
        message: "Unable to complete the costing request.",
      });
  });
  return root;
}
export default createCostingRouter(costingService);
