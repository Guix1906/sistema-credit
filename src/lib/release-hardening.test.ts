import { describe, expect, it } from 'vitest'

import appLayoutSource from '../components/app-layout.tsx?raw'
import clientDetailSource from '../pages/client-detail-page.tsx?raw'
import clientsPageSource from '../pages/clients-page.tsx?raw'
import storageServiceSource from '../services/storage-service.ts?raw'
import accessSettingsSource from '../services/access-settings-service.ts?raw'
import financeServiceSource from '../services/finance-service.ts?raw'
import settingsServiceSource from '../services/settings-service.ts?raw'
import settingsPageSource from '../pages/settings-page.tsx?raw'
import hardeningMigrationSource from '../../supabase/migrations/20260611173000_harden_release_readiness.sql?raw'
import saveAccessSettingsMigrationSource from '../../supabase/migrations/20260612071000_save_access_settings_rpc.sql?raw'
import saveFinanceAndAppSettingsMigrationSource from '../../supabase/migrations/20260612073000_save_finance_and_app_settings_rpc.sql?raw'

describe('release hardening', () => {
  it('uses archive-safe client deletion from the UI', () => {
    expect(clientsPageSource).toContain('delete_or_archive_client')
    expect(clientDetailSource).toContain('delete_or_archive_client')
    expect(clientsPageSource).not.toContain('purge_client_permanently')
    expect(clientDetailSource).not.toContain('purge_client_permanently')
  })

  it('uses effective settings RPCs with local fallbacks', () => {
    expect(appLayoutSource).toContain('get_current_app_settings')
    expect(accessSettingsSource).toContain('get_current_access_settings')
    expect(accessSettingsSource).toContain('save_access_settings')
    expect(settingsServiceSource).toContain('save_loan_settings')
    expect(settingsServiceSource).toContain('save_app_settings')
    expect(settingsPageSource).toContain('saveAccessSettings')
    expect(settingsPageSource).toContain('saveLoanSettings')
    expect(settingsPageSource).toContain('saveAppSettings')
    expect(financeServiceSource).toContain('get_current_loan_settings')
  })

  it('saves access settings through a guarded database function', () => {
    expect(saveAccessSettingsMigrationSource).toContain('create or replace function public.save_access_settings')
    expect(saveAccessSettingsMigrationSource).toContain('if not public.can_manage_all()')
    expect(saveAccessSettingsMigrationSource).toContain('public.resolve_operation_owner_id()')
    expect(saveAccessSettingsMigrationSource).toContain('grant execute on function public.save_access_settings')
  })

  it('saves finance and app settings through guarded database functions', () => {
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('create or replace function public.save_loan_settings')
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('create or replace function public.save_app_settings')
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('if not public.can_manage_all()')
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('public.resolve_operation_owner_id()')
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('grant execute on function public.save_loan_settings')
    expect(saveFinanceAndAppSettingsMigrationSource).toContain('grant execute on function public.save_app_settings')
  })

  it('stores uploaded files under the operation owner path', () => {
    expect(storageServiceSource).toContain('`${client.owner_id}/${input.clientId}/')
    expect(storageServiceSource).toContain('resolveReceiptOwnerId')
    expect(storageServiceSource).toContain('`${ownerId}/${input.folder}/${input.recordId}/')
  })

  it('keeps destructive database operations guarded by migration', () => {
    expect(hardeningMigrationSource).toContain('resolve_operation_owner_id')
    expect(hardeningMigrationSource).toContain('get_current_app_settings')
    expect(hardeningMigrationSource).toContain('get_current_access_settings')
    expect(hardeningMigrationSource).toContain('get_current_loan_settings')
    expect(hardeningMigrationSource).toContain('Cliente possui historico financeiro ou operacional')
    expect(hardeningMigrationSource).toContain('Team can upload accessible client document files')
    expect(hardeningMigrationSource).toContain("when 'manager' then 'gerente'")
  })
})
