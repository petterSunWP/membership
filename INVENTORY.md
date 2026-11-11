# 原料与包装库存第一版

已接入现有 Member2Go，入口为门店后台左侧 **Inventory 库存**（`/inventory`）。
数据库限定为已验证的 `127.0.0.1:3306 / membership_dev`；复用现有员工认证和门店成本权限。

## 已实现

- 原料、包装与 Recipe Costing 共用 `costing_materials`，已有配方继续引用原 ID。
- 建档或关联已有物料；包装规格历史、低库存线、未盘点与实际零库存分别显示。
- 手动期初盘点、入库、领用、报损、后续盘点和入／出库冲正；流水保留员工、日期、原因和前后余额。
- 数量使用 g、ml、个；输入 kg→g、L→ml。按包装数操作使用当时规格。没有重量转体积或订单自动扣库存。
- 防止负库存、重复提交、过期版本覆盖；写入余额、流水、价格和审计使用同一事务与门店锁。
- 有余额或被有效配方／预制原料依赖时禁止停用；停用库存后才允许归档对应成本物料。
- 数量和价格以十进制字符串传输并进行精确运算；显示两位，数据库最多八位；超出库存精度时拒绝输入。

## Excel 导入与价格联动

使用 [库存登记_核对版.xlsx](outputs/inventory-reviewed-20261109/库存登记_核对版.xlsx)。
九列表头依次为：物料编码、物料名称、类型、每包装含量、每包装价格（NZD）、包装数量、实盘总量、盘点日期、备注。
类型为“物料”或“包装”；含量例如 `100g`、`1kg`、`1L`、`50个`。

1. 选择文件后只解析、保存预览，不改变库存或成本物料。文件最多 3MB、1,000 行；不接受公式／富文本／链接单元格。
2. 检查同名物料关联、错误与跳过行。配置改动后重新预览；错误未解决不能确认。
3. 用户已确认当前表进价不含 GST，所以界面默认 **EXCLUSIVE**，仍显示明确选项；GST 默认 `0.15`，允许 `0`。
4. 确认后才创建共享档案、记录实际盘点以及可选的已知价格。一个文件要么整体成功，要么整体回滚。
5. 同一内容与配置重复确认不会重复盘点。更改配置或文件属于新预览，仍需人工确认；较旧盘点日期不能覆盖较新流水。

空白数量不等于零，空白价格不等于免费。包装的 `298个` 是当前总数，不能当作采购包装规格。
未知价格保留已有成本价格；没有规格时不能用总库存作价格分母。已有物料同名不同编码需显式关联，名称和单位不会被 Excel 覆盖。
四个规格／数量／价格都未填的货物暂时跳过，补齐后可以再导入。

库存包规格与成本单位兼容时，成本价格表单自动带入规格，只需填写价格和税务口径；服务端验证规格版本，历史价格分母保持不变。
若库存为 g 而已有配方用 ml，会提示并暂缓同步价格；成本页可以输入人工确认的实际可用量，本版不猜测密度。
当前核对表只做了读取验证，**尚未导入真实库存或价格**，留待你在页面检查并确认。

## 数据库与文件

- `membership-backend/sql/inventory/schema.sql`：五张 additive `inventory_` 表；没有外键、迁移框架、账本或自动启动 SQL。
- `membership-backend/src/inventory/{parsing,service,routes}.ts`：Excel、库存服务、HTTP API。
- `membership-backend/src/costing/inventory-links.ts` 与 `service.ts`：共享规格、价格事务和归档保护。
- `membership-store/src/inventory/`：库存列表、导入、表单与流水页面。
- `membership-store/src/costing/api.ts`、`Materials.tsx`：成本表单联动；`App.tsx` 与 `Sidebar.tsx` 增加入口。
- 后端 `tests/inventory/`、`tests/local/inventory.integration.test.ts`，前端 `tests/inventory.test.mjs`。
- 依赖 ExcelJS、JSZip；仅对 ExcelJS 的 UUID 依赖作定向覆盖，未批量升级现有业务依赖。

本地仅创建五张库存表，原有 37 张表的结构与 241 条记录在建表时均核对未变。
测试全部使用私有事务回滚；会消耗 costing/inventory 的自增序号（MySQL 回滚不回退序号），不会留下测试行，不重置序号。
私有基线及验证结果放在已忽略的 `.local-backups/`，不要提交备份文件。

## 本地运行

在两个终端分别运行（已有服务运行时无需重复启动）：

```bash
cd membership-backend
npm run dev
```

```bash
cd membership-store
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

打开 `http://127.0.0.1:5174/inventory`，使用现有员工账号登录。后端端口为 3000。
不要重新执行旧 SQL dump；无需再建表或运行迁移。生产配置和发布另行处理。

## 验收清单

1. 登录后打开库存，选择 TEA TALK Westgate；上传核对版。应读到 45 行、41 个已填写盘点、26 个已知价格。实际可同步数量取决于已有物料匹配结果。
2. 检查同名关联，确认不含 GST、税率 0.15、包装总数与空白价格；先只查看预览，确认未改变成本资料。
3. 确认导入，核对原料数量＝每包装规格×包装数，包装数量直接使用总数；未知资料不变成零。
4. 再次导入相同表格，核对不重复增加库存。日常后续盘点请填写真实盘点日期。
5. 对一个物料做入库、领用、报损，再输入实际盘点数；核对每次流水前后数量和盘点差额。尝试超量领用，应被拒绝。
6. 撤销一笔领用，核对新增冲正流水且原流水仍在；同一笔不能重复撤销。
7. 设置低库存线，核对低库存提醒；未盘点物料应先建立期初数量，可明确填写 0。
8. 在 Raw Ingredients／Packaging 更新进价，核对自动包规格、历史价格与配方成本、毛利联动；试用 GST 0。
9. kg 原料不能直接按 ml 出库或自动同步给 ml 配方；检查提示。包装价格未知时不应产生零成本。
10. 确认会员、订单、积分页面仍正常使用。库存不会自动影响订单。

## 验证命令与当前边界

后端：`npm run test:inventory`、`npm run test:inventory:local`、`npm run test:costing`、`npm run test:costing:local`、`npm run build`。
前端：`npm run test:inventory`、`npm run test:costing`、`npm run lint`、`npm run build`。
本地集成测试拒绝其他服务器身份，并检查回滚后所有表的结构／数据指纹。不要同时运行两套本地集成测试或在测试期间手动录入数据。

界面显示最多 1,000 个库存档案、最近 300 笔流水／单项 200 笔流水。尚未做分页报表、密度转换、预制批次库存、采购流程、订单扣库存与并发压力测试。
库存单元测试 7/7、库存本地集成场景 13/13、库存前端组件测试 6/6；成本回归单元 19/19、集成场景 13/13、前端 6/6 均通过。前后端 build 通过，lint 零错误，仅五项原有业务页面 Hook 警告。
最终只读复核：原有 37 张表 241 条记录与建表前指纹一致，13 张旧会员业务表结构一致，五张库存表均为空，零外键与零测试残留。
权限和计算已通过自动化 HTTP／SQL／组件测试；完整登录后的浏览器人工操作留给本轮 UAT。
现有后端依赖的 npm audit 仍有 3 项已有告警（moderate/high/critical），未作为本次库存改动批量升级。

## 下载当前数据模板更新价格

Excel import 页面新增 **Download current template**，从当前门店数据库生成英文 Excel，
包含有效原料／包装的编码、名称、当前包装规格和不含 GST 的价格。可填写杯盖等未知价格后上传。
杯盖按个报价填 `1each`；按 100 个一包报价填 `100each`，价格填写整包价格。

模板的 Pack Count、Total Counted Quantity、Count Date 默认留空，避免只更新价格时重新盘点。
只改价格时保持这三列空白，并选择 GST exclusive 上传。空白价格保留旧价格，明确填写 0 则表示零价格。
所有确认仍经过预览；规格或价格有变动才追加相应历史，不覆盖已有业务记录。

## Dual-mode Excel imports — current workflow

Excel is the primary inventory update path. The Import mode selector defaults to **Stocktake**;
choose **Stock Receipt** for incoming deliveries. The same nine-column template remains supported.
No schema changes, migration, additional module or production action is required.

- **Stocktake:** replace each entered quantity with actual counted stock; explicit zero sets zero.
- **Stock Receipt:** add incoming quantities using the existing Receipt implementation. A delivery
  batch reference is required and protected against reposting. Positive receipts require known opening
  stock; first use Stocktake to establish a count (including explicit zero) for a new/uncounted item.
  A zero receipt is a stock no-op.
- Blank quantities and missing file items leave balances unchanged. The existing downloaded template
  intentionally leaves quantity/date fields blank for safe price-only updates.
- In either mode, Sync entered pack prices independently controls price updates using selected GST
  basis/rate. Blank prices preserve old prices; an explicit zero price is a zero price. Both stock and
  price blank means no changes, even if a specification is filled. Price-only rows with sync off are
  skipped. This supersedes earlier specification-only import/catalog initialization behavior.
- Enabled prices without compatible usable pack contents now block the row. Correct the specification
  or explicitly turn off price sync to post stock only; there is no silent partial price deferral.
- The preview shows current, imported and resulting quantities, movement date, old/new price with
  quantity/GST basis/rate, import ID and delivery reference. All interface text stays English.
- Any unresolved ERROR blocks the whole included batch. Explicitly selecting Skip and refreshing the
  preview is the documented way to exclude rows; included valid rows then commit atomically together.
- Keep using the same delivery reference for retries. Case/spacing, row order and changed price settings
  cannot bypass completed-batch protection. A genuinely new delivery needs a new reference. The system
  cannot recognize the same physical delivery intentionally submitted under a different reference.
- Current scope/version checks and a preview token reject stale confirmation. Batch mode/reference,
  operator, dates, source rows and exclusions are stored in existing import JSON; movement request IDs,
  reasons and price notes link historical entries back to that batch. Historical entries are retained.

### Browser UAT for dual modes

Use the existing local frontend `/inventory`, Excel import tab, and your normal staff login.
Perform test postings only on local test materials; confirmed UAT operations are real local records.

1. Download current template; keep only the test material rows. Confirm mode defaults to Stocktake.
   Set Raw ingredient Pack Contents `500g`, Pack Count `2`, Count Date to the actual count date.
   Preview must show resulting stock `1000.00 g`, regardless of its old balance. Confirm and inspect History.
2. Stocktake the same item to explicit `0` and confirm zero. Next leave its quantity blank, edit a
   second material, and omit another material from the file: both blank/omitted items must stay unchanged.
3. Choose Stock Receipt and enter a unique delivery reference, e.g. `UAT-DELIVERY-001`.
   Enter Pack Count `1.5` at `500g`: preview must add `750.00 g` to current stock.
   A packaging row using Total Counted Quantity `8each` must add eight individual items.
4. Confirm, then re-upload and retry with the same delivery reference: no second stock posting.
   Change row order or price-sync settings and retry that reference: it must still not repost.
5. Test price-only in both modes: quantity/date blank, valid Pack Contents and new Pack Price;
   preview must leave stock unchanged and show the new price. Confirm and inspect preserved price history.
   Repeat with sync off: there must be no price change. Try GST inclusive/exclusive and rate zero.
6. Test quantity-only (blank price), and quantity plus price with sync on: only the requested values
   should change. A receipt of zero must not create a stock movement. A stocktake of zero must set zero.
7. Include a bad unit, malformed quantity, negative price or duplicate code. Preview errors must prevent
   confirmation with no stock/price changes. For an ordinary invalid row, deliberately Skip it and refresh
   the preview; verify the exclusion before confirming remaining valid rows. Duplicate codes must be fixed.
8. Preview a receipt, change that material through a manual local stock operation, then confirm the old
   preview: it must reject as stale. Refresh preview and confirm using the same pending delivery reference.
9. Try a positive receipt for a new/uncounted material: it must request an opening Stocktake first.
10. Inspect History and price history: operator, movement date, import ID and receipt reference should
    be traceable, with original entries intact. Confirm membership/orders and Recipe Costing still behave normally.

Dual-mode validation results (local): backend unit/schema/workbook tests 32 passed;
19 inventory HTTP/SQL scenarios passed, including forced mid-post rollback and single-post retry;
2 optional checks of the original reviewed workbook skipped because that local file is unavailable;
13 Recipe Costing HTTP/SQL regression scenarios passed; 12 frontend costing/inventory tests passed.
Both builds passed. Lint has zero errors and five pre-existing membership-page Hook warnings.
All SQL test fixtures were rolled back and original table schema/data fingerprints matched before/after.
The browser steps above are the user acceptance checklist; authenticated manual browser acceptance
has not been claimed as completed by the automated tests.


Production release preparation: see [RELEASE-COSTING-INVENTORY.md](RELEASE-COSTING-INVENTORY.md).
Production explicitly validates the configured database/server identity; default local mode
retains the previous local protections. Real stock is initialized by uploading the real Excel
online in Stocktake mode, not by copying local tables or test fixtures.
