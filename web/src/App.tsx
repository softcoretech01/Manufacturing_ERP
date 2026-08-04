import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { SIMPLE_MASTERS } from '@/mock/masterRegistry'
import { LoginPage } from '@/pages/auth/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { ProfilePage } from '@/pages/Profile'

// Organisation (Ch 6)
import { OrganisationExplorerPage } from '@/pages/admin/OrganisationExplorer'
import { CompanyPage } from '@/pages/admin/Company'
import { BranchesPage } from '@/pages/admin/Branches'
import { PlantsPage } from '@/pages/admin/Plants'
import { WarehousesPage } from '@/pages/admin/Warehouses'
import { DepartmentsPage } from '@/pages/admin/Departments'
import { CostCentresPage } from '@/pages/admin/CostCentres'
import { FinancialYearPage } from '@/pages/admin/FinancialYear'
import { CurrencyPage } from '@/pages/admin/Currency'

// Access control (Ch 7, 8)
import { UsersPage } from '@/pages/admin/Users'
import { RolesPage } from '@/pages/admin/Roles'
import { PermissionExplorerPage } from '@/pages/admin/PermissionExplorer'
import { DelegationsPage } from '@/pages/admin/Delegations'
import { SessionsPage } from '@/pages/admin/Sessions'
import { ApiKeysPage } from '@/pages/admin/ApiKeys'
import { SodPage } from '@/pages/admin/Sod'
import { LoginActivityPage } from '@/pages/admin/LoginActivity'

// Workflow (Ch 9)
import { ApprovalInboxPage } from '@/pages/workflow/Inbox'
import { ApprovalMatrixPage } from '@/pages/workflow/Matrix'
import { WorkflowDesignerPage } from '@/pages/workflow/Designer'
import { WorkflowMonitorPage } from '@/pages/workflow/Monitor'

// Platform services (Ch 10–14, 18, 19)
import { NumberingPage } from '@/pages/admin/Numbering'
import { NotificationsPage } from '@/pages/admin/Notifications'
import { MasterFrameworkPage } from '@/pages/admin/MasterFramework'
import { AttachmentsPage } from '@/pages/admin/Attachments'
import { CollaborationPage } from '@/pages/admin/Collaboration'
import { BarcodePage } from '@/pages/admin/Barcode'
import { ReportsPage } from '@/pages/admin/Reports'

// Master data management
import { MasterOverviewPage } from '@/pages/masters/Overview'
import { SupplierMasterPage } from '@/pages/masters/Supplier'
import { CustomerMasterPage } from '@/pages/masters/Customer'
import { ItemMasterPage } from '@/pages/masters/Item'
import { EmployeeMasterPage } from '@/pages/masters/Employee'
import { MachineMasterPage } from '@/pages/masters/Machine'
import { SimpleMasterPage } from '@/pages/masters/SimpleMaster'
import { ImportExportPage } from '@/pages/masters/ImportExport'
import { DuplicatesPage } from '@/pages/masters/Duplicates'

// Procurement & supplier management
import { ProcurementDashboardPage } from '@/pages/procurement/Dashboard'
import { RequisitionsPage } from '@/pages/procurement/Requisitions'
import { MrpPage } from '@/pages/procurement/Mrp'
import { RfqPage } from '@/pages/procurement/Rfq'
import { OrdersPage } from '@/pages/procurement/Orders'
import { ImportsPage } from '@/pages/procurement/Imports'
import { AsnPage } from '@/pages/procurement/Asn'
import { GrnPage } from '@/pages/procurement/Grn'
import { ReturnsPage } from '@/pages/procurement/Returns'
import { EvaluationPage } from '@/pages/procurement/Evaluation'
import { ContractsPage } from '@/pages/procurement/Contracts'
import { AnalyticsPage } from '@/pages/procurement/Analytics'
import { QuotationsPage } from '@/pages/procurement/Quotations'
import { ComparisonPage } from '@/pages/procurement/Comparison'
import { ProcurementSettingsPage } from '@/pages/procurement/Settings'

// Inventory & warehouse management (Vol 4)
import { InventoryDashboardPage } from '@/pages/inventory/Dashboard'
import { StockEnquiryPage } from '@/pages/inventory/Stock'
import { StockLedgerPage } from '@/pages/inventory/Ledger'
import { PutawayPage } from '@/pages/inventory/Putaway'
import { MaterialIssuePage } from '@/pages/inventory/Issues'
import { TransfersPage } from '@/pages/inventory/Transfers'
import { AdjustmentsPage } from '@/pages/inventory/Adjustments'
import { CountingPage } from '@/pages/inventory/Counting'
import { BatchesPage } from '@/pages/inventory/Batches'
import { ValuationPage } from '@/pages/inventory/Valuation'
import { WarehousesPage as InventoryWarehousesPage } from '@/pages/inventory/Warehouses'
import { InventoryReportsPage } from '@/pages/inventory/Reports'
import { GoodsReceiptPage } from '@/pages/inventory/Receipts'
import { ReservationsPage } from '@/pages/inventory/Reservations'
import { WarehouseStructurePage } from '@/pages/inventory/Structure'
import { LabelsPage } from '@/pages/inventory/Labels'
import { StockAgeingPage } from '@/pages/inventory/Ageing'
import { AbcXyzPage } from '@/pages/inventory/AbcXyz'
import { StockMovementPage } from '@/pages/inventory/Movement'
import { ReorderReportPage } from '@/pages/inventory/Reorder'
import { RequisitionsPage as InventoryRequisitionsPage } from '@/pages/inventory/Requisitions'
import { MaterialReturnsPage } from '@/pages/inventory/Returns'
import { GoodsInTransitPage } from '@/pages/inventory/GoodsInTransit'
import { JobWorkPage } from '@/pages/inventory/JobWork'
import { ScrapPage } from '@/pages/inventory/Scrap'
import { SerialsPage } from '@/pages/inventory/Serials'
import { TraceabilityPage } from '@/pages/inventory/Traceability'
import { PhysicalVerificationPage } from '@/pages/inventory/Verification'
import { VarianceApprovalPage } from '@/pages/inventory/Variance'
import { BinMapPage } from '@/pages/inventory/BinMap'

// Product engineering — BOM & routing (Vol 6)
import { EngineeringDashboardPage } from '@/pages/engineering/Dashboard'
import { ProductsPage } from '@/pages/engineering/Products'
import { BomPage } from '@/pages/engineering/Bom'
import { BomExplorerPage } from '@/pages/engineering/BomExplorer'
import { RoutingPage } from '@/pages/engineering/Routing'
import { WorkCentresPage } from '@/pages/engineering/WorkCentres'
import { OperationsPage } from '@/pages/engineering/Operations'
import { ToolsPage } from '@/pages/engineering/Tools'
import { CostingPage } from '@/pages/engineering/Costing'
import { ChangesPage } from '@/pages/engineering/Changes'
import { EngDocumentsPage } from '@/pages/engineering/Documents'
import { EngReportsPage } from '@/pages/engineering/Reports'

// Production planning & MRP (Vol 7)
import { PlanningDashboardPage } from '@/pages/planning/Dashboard'
import { ForecastPage } from '@/pages/planning/Forecast'
import { DemandPage } from '@/pages/planning/Demand'
import { MpsPage } from '@/pages/planning/Mps'
import { MrpPage as PlanningMrpPage } from '@/pages/planning/Mrp'
import { CapacityPage } from '@/pages/planning/Capacity'
import { ProductionOrdersPage as PlanningOrdersPage } from '@/pages/planning/Orders'
import { SchedulePage } from '@/pages/planning/Schedule'
import { ReservationsPage as PlanningReservationsPage } from '@/pages/planning/Reservations'
import { CalendarPage } from '@/pages/planning/Calendar'
import { PlanningReportsPage } from '@/pages/planning/Reports'

// Shop floor execution — MES (Vol 8)
import { MesDashboardPage } from '@/pages/mes/Dashboard'
import { ProductionOrdersPage as MesOrdersPage } from '@/pages/mes/Orders'
import { WorkOrdersPage } from '@/pages/mes/WorkOrders'
import { OperationQueuePage } from '@/pages/mes/Queue'
import { ProductionEntryPage } from '@/pages/mes/Entry'
import { WipPage } from '@/pages/mes/Wip'
import { InstructionsPage } from '@/pages/mes/Instructions'
import { MachinesPage } from '@/pages/mes/Machines'
import { DowntimePage } from '@/pages/mes/Downtime'
import { OeePage } from '@/pages/mes/Oee'
import { ScrapPage as ProductionScrapPage } from '@/pages/mes/Scrap'
import { ReworkPage } from '@/pages/mes/Rework'
import { ShiftsPage } from '@/pages/mes/Shifts'
import { LabourPage } from '@/pages/mes/Labour'
import { TravellerPage } from '@/pages/mes/Traveller'
import { GenealogyPage } from '@/pages/mes/Genealogy'
import { MesReportsPage } from '@/pages/mes/Reports'

// Packing, dispatch & logistics (Vol 10)
import { DispatchDashboardPage } from '@/pages/dispatch/Dashboard'
import { PackingOrdersPage } from '@/pages/dispatch/PackingOrders'
import { PackMaterialsPage } from '@/pages/dispatch/Materials'
import { CartonsPage } from '@/pages/dispatch/Cartons'
import { PalletsPage } from '@/pages/dispatch/Pallets'
import { PackLabelsPage } from '@/pages/dispatch/Labels'
import { DispatchPlanningPage } from '@/pages/dispatch/Planning'
import { PickListsPage } from '@/pages/dispatch/PickLists'
import { LoadingPage } from '@/pages/dispatch/Loading'
import { VehiclesPage } from '@/pages/dispatch/Vehicles'
import { ShipmentsPage } from '@/pages/dispatch/Shipments'
import { TrackingPage } from '@/pages/dispatch/Tracking'
import { PodPage } from '@/pages/dispatch/Pod'
import { SalesReturnsPage } from '@/pages/dispatch/Returns'
import { FreightPage } from '@/pages/dispatch/Freight'
import { TransportersPage } from '@/pages/dispatch/Transporters'
import { ExportsPage } from '@/pages/dispatch/Exports'
import { ExportDocsPage } from '@/pages/dispatch/ExportDocs'
import { DispatchReportsPage } from '@/pages/dispatch/Reports'

// Quality management (Vol 9)
import { QualityDashboardPage } from '@/pages/quality/Dashboard'
import { PlansPage } from '@/pages/quality/Plans'
import { InspectionsPage } from '@/pages/quality/Inspections'
import { DefectsPage } from '@/pages/quality/Defects'
import { NcrPage } from '@/pages/quality/Ncr'
import { CapaPage } from '@/pages/quality/Capa'
import { CalibrationPage } from '@/pages/quality/Calibration'
import { SupplierQualityPage } from '@/pages/quality/Suppliers'
import { ComplaintsPage } from '@/pages/quality/Complaints'
import { AuditsPage } from '@/pages/quality/Audits'
import { QualityReportsPage } from '@/pages/quality/Reports'

// Plant maintenance, EAM & CMMS (Volume 13)
import { MaintenanceDashboardPage } from '@/pages/maintenance/Dashboard'
import { AssetsPage } from '@/pages/maintenance/Assets'
import { PmPlansPage } from '@/pages/maintenance/PmPlans'
import { WorkOrdersPage as MaintWorkOrdersPage } from '@/pages/maintenance/WorkOrders'
import { BreakdownsPage } from '@/pages/maintenance/Breakdowns'
import { ConditionPage } from '@/pages/maintenance/Condition'
import { SparesPage } from '@/pages/maintenance/Spares'
import { TechniciansPage } from '@/pages/maintenance/Technicians'
import { PermitsPage } from '@/pages/maintenance/Permits'
import { UtilitiesPage } from '@/pages/maintenance/Utilities'
import { ShutdownsPage } from '@/pages/maintenance/Shutdowns'
import { MaintenanceReportsPage } from '@/pages/maintenance/Reports'

// Finance, cost accounting & taxation (Volume 11)
import { FinanceDashboardPage } from '@/pages/finance/Dashboard'
import { ChartOfAccountsPage } from '@/pages/finance/Accounts'
import { JournalsPage } from '@/pages/finance/Journals'
import { StatementsPage } from '@/pages/finance/Statements'
import { ReceivablesPage, PayablesPage } from '@/pages/finance/Receivables'
import { BankingPage } from '@/pages/finance/Banking'
import { CostingPage as FinanceCostingPage } from '@/pages/finance/Costing'
import { TaxPage } from '@/pages/finance/Tax'
import { FixedAssetsPage } from '@/pages/finance/Assets'
import { BudgetsPage } from '@/pages/finance/Budgets'
import { PeriodClosePage } from '@/pages/finance/Close'

// HR, payroll & workforce management (Vol 12)
import { HrmsDashboardPage } from '@/pages/hrms/Dashboard'
import { EmployeesPage as HrEmployeesPage } from '@/pages/hrms/Employees'
import { OrganisationPage } from '@/pages/hrms/Organisation'
import { RequisitionsPage as ManpowerRequisitionsPage } from '@/pages/hrms/Requisitions'
import { RecruitmentPage } from '@/pages/hrms/Recruitment'
import { AttendancePage } from '@/pages/hrms/Attendance'
import { OvertimePage } from '@/pages/hrms/Overtime'
import { ShiftsPage as HrShiftsPage } from '@/pages/hrms/Shifts'
import { LeavePage } from '@/pages/hrms/Leave'
import { PayrollPage } from '@/pages/hrms/Payroll'
import { PayslipsPage } from '@/pages/hrms/Payslips'
import { SalaryStructuresPage } from '@/pages/hrms/SalaryStructures'
import { StatutoryPage } from '@/pages/hrms/Statutory'
import { IncentivesPage } from '@/pages/hrms/Incentives'
import { LabourCostPage } from '@/pages/hrms/LabourCost'
import { SkillsPage } from '@/pages/hrms/Skills'
import { ContractorsPage } from '@/pages/hrms/Contractors'
import { PerformancePage } from '@/pages/hrms/Performance'
import { TrainingPage } from '@/pages/hrms/Training'
import { SelfServicePage } from '@/pages/hrms/SelfService'
import { TeamPage } from '@/pages/hrms/Team'
import { HrmsReportsPage } from '@/pages/hrms/Reports'

/* ── Business Intelligence, Analytics & AI Insights (Vol 14) ────────────── */
import { BiRouteLayout } from '@/components/bi/BiShell'
import { BiExecutivePage } from '@/pages/bi/Executive'
import { BiDashboardsPage } from '@/pages/bi/Dashboards'
import { BiInsightsPage } from '@/pages/bi/Insights'
import { BiProductionPage } from '@/pages/bi/Production'
import { BiQualityPage } from '@/pages/bi/Quality'
import { BiMaintenancePage } from '@/pages/bi/Maintenance'
import { BiProcurementPage } from '@/pages/bi/Procurement'
import { BiInventoryPage } from '@/pages/bi/Inventory'
import { BiSalesPage } from '@/pages/bi/Sales'
import { BiFinancePage } from '@/pages/bi/Finance'
import { BiWorkforcePage } from '@/pages/bi/Workforce'
import { BiForecastsPage } from '@/pages/bi/Forecasts'
import { BiKpiLibraryPage } from '@/pages/bi/KpiLibrary'
import { BiScorecardsPage } from '@/pages/bi/Scorecards'
import { BiAlertsPage } from '@/pages/bi/Alerts'
import { BiReportsPage } from '@/pages/bi/Reports'
import { BiDataSourcesPage } from '@/pages/bi/DataSources'
import { BiGovernancePage } from '@/pages/bi/Governance'

// Compliance & ops (Ch 15, 20, 22, 27, 28)
import { AuditPage } from '@/pages/admin/Audit'
import { ParametersPage } from '@/pages/admin/Parameters'
import { IntegrationsPage } from '@/pages/admin/Integrations'
import { JobsPage } from '@/pages/admin/Jobs'
import { BackupPage } from '@/pages/admin/Backup'

// Platform services — Volume 15 gaps
import { DocumentsPage } from '@/pages/admin/Documents'
import { DataImportPage } from '@/pages/admin/DataImport'
import { SecurityPage } from '@/pages/admin/Security'
import { MonitoringPage } from '@/pages/admin/Monitoring'
import { AdminReportsPage } from '@/pages/admin/AdminReports'
import { LicensePage } from '@/pages/admin/License'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Organisation */}
        <Route path="/admin/organisation" element={<OrganisationExplorerPage />} />
        <Route path="/admin/company" element={<CompanyPage />} />
        <Route path="/admin/branches" element={<BranchesPage />} />
        <Route path="/admin/plants" element={<PlantsPage />} />
        <Route path="/admin/warehouses" element={<WarehousesPage />} />
        <Route path="/admin/departments" element={<DepartmentsPage />} />
        <Route path="/admin/cost-centres" element={<CostCentresPage />} />
        <Route path="/admin/financial-year" element={<FinancialYearPage />} />
        <Route path="/admin/currency" element={<CurrencyPage />} />

        {/* Access control */}
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/roles" element={<RolesPage />} />
        <Route path="/admin/permissions" element={<PermissionExplorerPage />} />
        <Route path="/admin/delegations" element={<DelegationsPage />} />
        <Route path="/admin/sessions" element={<SessionsPage />} />
        <Route path="/admin/api-keys" element={<ApiKeysPage />} />
        <Route path="/admin/sod" element={<SodPage />} />
        <Route path="/admin/login-activity" element={<LoginActivityPage />} />

        {/* Workflow */}
        <Route path="/workflow/inbox" element={<ApprovalInboxPage />} />
        <Route path="/workflow/matrix" element={<ApprovalMatrixPage />} />
        <Route path="/workflow/designer" element={<WorkflowDesignerPage />} />
        <Route path="/workflow/monitor" element={<WorkflowMonitorPage />} />

        {/* Platform services */}
        <Route path="/admin/numbering" element={<NumberingPage />} />
        <Route path="/admin/notifications" element={<NotificationsPage />} />
        <Route path="/admin/masters" element={<MasterFrameworkPage />} />
        <Route path="/admin/attachments" element={<AttachmentsPage />} />
        <Route path="/admin/collaboration" element={<CollaborationPage />} />
        <Route path="/admin/barcode" element={<BarcodePage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />

        {/* Master data */}
        <Route path="/masters" element={<MasterOverviewPage />} />
        <Route path="/masters/supplier" element={<SupplierMasterPage />} />
        <Route path="/masters/customer" element={<CustomerMasterPage />} />
        <Route path="/masters/item" element={<ItemMasterPage />} />
        <Route path="/masters/employee" element={<EmployeeMasterPage />} />
        <Route path="/masters/machine" element={<MachineMasterPage />} />
        <Route path="/masters/import" element={<ImportExportPage />} />
        <Route path="/masters/duplicates" element={<DuplicatesPage />} />
        {/* Every remaining master is rendered from the registry by one screen. */}
        {SIMPLE_MASTERS.map((m) => (
          <Route key={m.code} path={m.route} element={<SimpleMasterPage />} />
        ))}

        {/* Procurement */}
        <Route path="/procurement" element={<ProcurementDashboardPage />} />
        <Route path="/procurement/requisitions" element={<RequisitionsPage />} />
        <Route path="/procurement/mrp" element={<MrpPage />} />
        <Route path="/procurement/rfq" element={<RfqPage />} />
        <Route path="/procurement/orders" element={<OrdersPage />} />
        <Route path="/procurement/imports" element={<ImportsPage />} />
        <Route path="/procurement/asn" element={<AsnPage />} />
        <Route path="/procurement/grn" element={<GrnPage />} />
        <Route path="/procurement/returns" element={<ReturnsPage />} />
        <Route path="/procurement/evaluation" element={<EvaluationPage />} />
        <Route path="/procurement/contracts" element={<ContractsPage />} />
        <Route path="/procurement/analytics" element={<AnalyticsPage />} />
        <Route path="/procurement/quotations" element={<QuotationsPage />} />
        <Route path="/procurement/comparison" element={<ComparisonPage />} />
        <Route path="/procurement/settings" element={<ProcurementSettingsPage />} />

        {/* Inventory & warehouse */}
        <Route path="/inventory" element={<InventoryDashboardPage />} />
        <Route path="/inventory/stock" element={<StockEnquiryPage />} />
        <Route path="/inventory/ledger" element={<StockLedgerPage />} />
        <Route path="/inventory/putaway" element={<PutawayPage />} />
        <Route path="/inventory/issues" element={<MaterialIssuePage />} />
        <Route path="/inventory/transfers" element={<TransfersPage />} />
        <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
        <Route path="/inventory/counting" element={<CountingPage />} />
        <Route path="/inventory/batches" element={<BatchesPage />} />
        <Route path="/inventory/valuation" element={<ValuationPage />} />
        <Route path="/inventory/warehouses" element={<InventoryWarehousesPage />} />
        <Route path="/inventory/reports" element={<InventoryReportsPage />} />
        <Route path="/inventory/receipts" element={<GoodsReceiptPage />} />
        <Route path="/inventory/reservations" element={<ReservationsPage />} />
        <Route path="/inventory/structure" element={<WarehouseStructurePage />} />
        <Route path="/inventory/labels" element={<LabelsPage />} />
        <Route path="/inventory/ageing" element={<StockAgeingPage />} />
        <Route path="/inventory/abc-xyz" element={<AbcXyzPage />} />
        <Route path="/inventory/movement" element={<StockMovementPage />} />
        <Route path="/inventory/reorder" element={<ReorderReportPage />} />
        <Route path="/inventory/requisitions" element={<InventoryRequisitionsPage />} />
        <Route path="/inventory/returns" element={<MaterialReturnsPage />} />
        <Route path="/inventory/goods-in-transit" element={<GoodsInTransitPage />} />
        <Route path="/inventory/job-work" element={<JobWorkPage />} />
        <Route path="/inventory/scrap" element={<ScrapPage />} />
        <Route path="/inventory/serials" element={<SerialsPage />} />
        <Route path="/inventory/traceability" element={<TraceabilityPage />} />
        <Route path="/inventory/verification" element={<PhysicalVerificationPage />} />
        <Route path="/inventory/variance" element={<VarianceApprovalPage />} />
        <Route path="/inventory/bin-map" element={<BinMapPage />} />

        {/* Product engineering */}
        <Route path="/engineering" element={<EngineeringDashboardPage />} />
        <Route path="/engineering/products" element={<ProductsPage />} />
        <Route path="/engineering/bom" element={<BomPage />} />
        <Route path="/engineering/bom-explorer" element={<BomExplorerPage />} />
        <Route path="/engineering/routing" element={<RoutingPage />} />
        <Route path="/engineering/work-centres" element={<WorkCentresPage />} />
        <Route path="/engineering/operations" element={<OperationsPage />} />
        <Route path="/engineering/tools" element={<ToolsPage />} />
        <Route path="/engineering/costing" element={<CostingPage />} />
        <Route path="/engineering/changes" element={<ChangesPage />} />
        <Route path="/engineering/documents" element={<EngDocumentsPage />} />
        <Route path="/engineering/reports" element={<EngReportsPage />} />

        {/* Production planning */}
        <Route path="/planning" element={<PlanningDashboardPage />} />
        <Route path="/planning/forecast" element={<ForecastPage />} />
        <Route path="/planning/demand" element={<DemandPage />} />
        <Route path="/planning/mps" element={<MpsPage />} />
        <Route path="/planning/mrp" element={<PlanningMrpPage />} />
        <Route path="/planning/capacity" element={<CapacityPage />} />
        <Route path="/planning/orders" element={<PlanningOrdersPage />} />
        <Route path="/planning/schedule" element={<SchedulePage />} />
        <Route path="/planning/reservations" element={<PlanningReservationsPage />} />
        <Route path="/planning/calendar" element={<CalendarPage />} />
        <Route path="/planning/reports" element={<PlanningReportsPage />} />

        {/* Shop floor execution — one route per menu item */}
        <Route path="/production" element={<MesDashboardPage />} />
        <Route path="/production/orders" element={<MesOrdersPage />} />
        <Route path="/production/work-orders" element={<WorkOrdersPage />} />
        <Route path="/production/queue" element={<OperationQueuePage />} />
        <Route path="/production/entry" element={<ProductionEntryPage />} />
        <Route path="/production/wip" element={<WipPage />} />
        <Route path="/production/instructions" element={<InstructionsPage />} />
        <Route path="/production/machines" element={<MachinesPage />} />
        <Route path="/production/downtime" element={<DowntimePage />} />
        <Route path="/production/oee" element={<OeePage />} />
        <Route path="/production/scrap" element={<ProductionScrapPage />} />
        <Route path="/production/rework" element={<ReworkPage />} />
        <Route path="/production/shifts" element={<ShiftsPage />} />
        <Route path="/production/labour" element={<LabourPage />} />
        <Route path="/production/traveller" element={<TravellerPage />} />
        <Route path="/production/genealogy" element={<GenealogyPage />} />
        <Route path="/production/reports" element={<MesReportsPage />} />

        {/* Packing, dispatch & logistics — one route per menu item */}
        <Route path="/dispatch" element={<DispatchDashboardPage />} />
        <Route path="/dispatch/packing-orders" element={<PackingOrdersPage />} />
        <Route path="/dispatch/packing-materials" element={<PackMaterialsPage />} />
        <Route path="/dispatch/cartons" element={<CartonsPage />} />
        <Route path="/dispatch/pallets" element={<PalletsPage />} />
        <Route path="/dispatch/labels" element={<PackLabelsPage />} />
        <Route path="/dispatch/planning" element={<DispatchPlanningPage />} />
        <Route path="/dispatch/pick-lists" element={<PickListsPage />} />
        <Route path="/dispatch/loading" element={<LoadingPage />} />
        <Route path="/dispatch/vehicles" element={<VehiclesPage />} />
        <Route path="/dispatch/shipments" element={<ShipmentsPage />} />
        <Route path="/dispatch/tracking" element={<TrackingPage />} />
        <Route path="/dispatch/pod" element={<PodPage />} />
        <Route path="/dispatch/returns" element={<SalesReturnsPage />} />
        <Route path="/dispatch/freight" element={<FreightPage />} />
        <Route path="/dispatch/transporters" element={<TransportersPage />} />
        <Route path="/dispatch/exports" element={<ExportsPage />} />
        <Route path="/dispatch/export-documents" element={<ExportDocsPage />} />
        <Route path="/dispatch/reports" element={<DispatchReportsPage />} />

        {/* Quality management */}
        <Route path="/quality" element={<QualityDashboardPage />} />
        <Route path="/quality/plans" element={<PlansPage />} />
        <Route path="/quality/inspections" element={<InspectionsPage />} />
        <Route path="/quality/defects" element={<DefectsPage />} />
        <Route path="/quality/ncr" element={<NcrPage />} />
        <Route path="/quality/capa" element={<CapaPage />} />
        <Route path="/quality/calibration" element={<CalibrationPage />} />
        <Route path="/quality/suppliers" element={<SupplierQualityPage />} />
        <Route path="/quality/complaints" element={<ComplaintsPage />} />
        <Route path="/quality/audits" element={<AuditsPage />} />
        <Route path="/quality/reports" element={<QualityReportsPage />} />

        {/* Plant maintenance, EAM & CMMS */}
        <Route path="/maintenance" element={<MaintenanceDashboardPage />} />
        <Route path="/maintenance/assets" element={<AssetsPage />} />
        <Route path="/maintenance/pm" element={<PmPlansPage />} />
        <Route path="/maintenance/work-orders" element={<MaintWorkOrdersPage />} />
        <Route path="/maintenance/breakdowns" element={<BreakdownsPage />} />
        <Route path="/maintenance/condition" element={<ConditionPage />} />
        <Route path="/maintenance/spares" element={<SparesPage />} />
        <Route path="/maintenance/technicians" element={<TechniciansPage />} />
        <Route path="/maintenance/permits" element={<PermitsPage />} />
        <Route path="/maintenance/utilities" element={<UtilitiesPage />} />
        <Route path="/maintenance/shutdowns" element={<ShutdownsPage />} />
        <Route path="/maintenance/reports" element={<MaintenanceReportsPage />} />

        {/* Finance, cost accounting & taxation */}
        <Route path="/finance" element={<FinanceDashboardPage />} />
        <Route path="/finance/accounts" element={<ChartOfAccountsPage />} />
        <Route path="/finance/journals" element={<JournalsPage />} />
        <Route path="/finance/statements" element={<StatementsPage />} />
        <Route path="/finance/receivables" element={<ReceivablesPage />} />
        <Route path="/finance/payables" element={<PayablesPage />} />
        <Route path="/finance/banking" element={<BankingPage />} />
        <Route path="/finance/costing" element={<FinanceCostingPage />} />
        <Route path="/finance/tax" element={<TaxPage />} />
        <Route path="/finance/assets" element={<FixedAssetsPage />} />
        <Route path="/finance/budgets" element={<BudgetsPage />} />
        <Route path="/finance/close" element={<PeriodClosePage />} />

        {/* HR, payroll & workforce — one route per menu item */}
        <Route path="/hrms" element={<HrmsDashboardPage />} />
        <Route path="/hrms/employees" element={<HrEmployeesPage />} />
        <Route path="/hrms/organisation" element={<OrganisationPage />} />
        <Route path="/hrms/requisitions" element={<ManpowerRequisitionsPage />} />
        <Route path="/hrms/recruitment" element={<RecruitmentPage />} />
        <Route path="/hrms/attendance" element={<AttendancePage />} />
        <Route path="/hrms/overtime" element={<OvertimePage />} />
        <Route path="/hrms/shifts" element={<HrShiftsPage />} />
        <Route path="/hrms/leave" element={<LeavePage />} />
        <Route path="/hrms/payroll" element={<PayrollPage />} />
        <Route path="/hrms/payslips" element={<PayslipsPage />} />
        <Route path="/hrms/salary-structures" element={<SalaryStructuresPage />} />
        <Route path="/hrms/statutory" element={<StatutoryPage />} />
        <Route path="/hrms/incentives" element={<IncentivesPage />} />
        <Route path="/hrms/labour-cost" element={<LabourCostPage />} />
        <Route path="/hrms/skills" element={<SkillsPage />} />
        <Route path="/hrms/contractors" element={<ContractorsPage />} />
        <Route path="/hrms/performance" element={<PerformancePage />} />
        <Route path="/hrms/training" element={<TrainingPage />} />
        <Route path="/hrms/self-service" element={<SelfServicePage />} />
        <Route path="/hrms/team" element={<TeamPage />} />
        <Route path="/hrms/reports" element={<HrmsReportsPage />} />

        {/* Analytics & business intelligence (Vol 14). Wrapped in the filter
            layout so plant, line and period survive moving between screens. */}
        <Route element={<BiRouteLayout />}>
          <Route path="/bi" element={<BiExecutivePage />} />
          <Route path="/bi/dashboards" element={<BiDashboardsPage />} />
          <Route path="/bi/insights" element={<BiInsightsPage />} />
          <Route path="/bi/production" element={<BiProductionPage />} />
          <Route path="/bi/quality" element={<BiQualityPage />} />
          <Route path="/bi/maintenance" element={<BiMaintenancePage />} />
          <Route path="/bi/procurement" element={<BiProcurementPage />} />
          <Route path="/bi/inventory" element={<BiInventoryPage />} />
          <Route path="/bi/sales" element={<BiSalesPage />} />
          <Route path="/bi/finance" element={<BiFinancePage />} />
          <Route path="/bi/workforce" element={<BiWorkforcePage />} />
          <Route path="/bi/forecasts" element={<BiForecastsPage />} />
          <Route path="/bi/kpis" element={<BiKpiLibraryPage />} />
          <Route path="/bi/scorecards" element={<BiScorecardsPage />} />
          <Route path="/bi/alerts" element={<BiAlertsPage />} />
          <Route path="/bi/reports" element={<BiReportsPage />} />
          <Route path="/bi/data-sources" element={<BiDataSourcesPage />} />
          <Route path="/bi/governance" element={<BiGovernancePage />} />
        </Route>

        {/* Compliance & ops */}
        <Route path="/admin/audit" element={<AuditPage />} />
        <Route path="/admin/parameters" element={<ParametersPage />} />
        <Route path="/admin/integrations" element={<IntegrationsPage />} />
        <Route path="/admin/jobs" element={<JobsPage />} />
        <Route path="/admin/backup" element={<BackupPage />} />
        <Route path="/admin/documents" element={<DocumentsPage />} />
        <Route path="/admin/import" element={<DataImportPage />} />
        <Route path="/admin/security" element={<SecurityPage />} />
        <Route path="/admin/monitoring" element={<MonitoringPage />} />
        <Route path="/admin/admin-reports" element={<AdminReportsPage />} />
        <Route path="/admin/license" element={<LicensePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
