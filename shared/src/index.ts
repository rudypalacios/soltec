export { createApiClient } from './api/client';
export type { ApiClient, ApiClientOptions } from './api/client';
export type { components, paths } from './api/generated/schema';
export { ApiError, toApiError, unwrap, unwrapEmpty } from './api/errors';
export { AuthSession } from './auth/session';
export type { AuthSessionOptions, SessionState } from './auth/session';
export { can } from './domain/permissions';
export {
  checkState,
  countWithAccess,
  hasAccess,
  matrixOfRole,
  setActions,
  setScope,
  toPayload,
} from './domain/permissionMatrix';
export type { CheckState, MatrixScope, MatrixValue } from './domain/permissionMatrix';
export { bundleCostPreview, isValidQuantity, lineCostPreview } from './domain/bundleCost';
export type { CostLine } from './domain/bundleCost';
export { calculatePrice, isValidCost, PriceError } from './domain/price';
export type { Price, PriceErrorCode, PriceInput } from './domain/price';
export { percentToRate, rateToPercent } from './domain/rates';
export type { DeviceIdStore } from './ports/deviceIdStore';
export { groupChecks, isRequirementsReport } from './system/requirements';
export type {
  CheckGroup,
  CheckStatus,
  RequirementCheck,
  RequirementsReport,
  RequirementsVerdict,
} from './system/requirements';
