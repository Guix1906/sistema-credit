-- One-time go-live cleanup requested by the system owner.
-- Preserve users, profiles, settings and schema configuration.
delete from public.cash_movements;
delete from public.collection_logs;
delete from public.alerts;
delete from public.client_documents;
delete from public.payments;
delete from public.installments;
delete from public.expenses;
delete from public.loans;
delete from public.clients;
delete from public.cashboxes;
delete from public.routes;
