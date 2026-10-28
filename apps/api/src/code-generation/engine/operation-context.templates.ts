import type { GenerationContext, GeneratedProjectFile } from './types';
import { file } from './types';
import { pluralize } from '../naming';
import { actionMarker, pagePath, toWebRoot } from './frontend.templates';

export function operationContextFiles({ plan }: GenerationContext): GeneratedProjectFile[] {
  const local = plan.authentication.local!;
  const scope = local.scope!;
  const elements = ['endpoint:GET /auth/context', 'endpoint:POST /auth/context'];
  const home = plan.routes.find((route) =>
    route.actions.some((action) => action.endpoint === 'GET /auth/options'),
  )!.path;
  const account = plan.entities.find((entity) => entity.localId === local.userEntityLocalId)!;
  const role = plan.entities.find(
    (entity) =>
      entity.localId ===
      account.relations.find((relation) => relation.name === local.roleRelation)!
        .targetEntityLocalId,
  )!;
  const permission = plan.entities.find(
    (entity) =>
      entity.localId ===
      role.relations.find((relation) => relation.name === scope.permissionRelation)!
        .targetEntityLocalId,
  )!;
  const scopes = plan.entities.find((entity) => entity.localId === scope.entityLocalId)!;
  const files = [
    file(
      'apps/web/app/providers.tsx',
      `'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
function OperationBoundary({children}: {children: ReactNode}) {
 const [revision, setRevision] = useState(0);
 useEffect(() => { const changed = () => setRevision(value => value + 1); window.addEventListener('operation-scope-changed', changed); return () => window.removeEventListener('operation-scope-changed', changed); }, []);
 return <div key={revision}>{children}</div>;
}
export function Providers({children}: {children: ReactNode}) {
 const [client] = useState(() => new QueryClient());
 return <QueryClientProvider client={client}><OperationBoundary>{children}</OperationBoundary><Toaster richColors position="top-right" /></QueryClientProvider>;
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
    file(
      'apps/web/components/operation-context.tsx',
      `'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, accessToken, operationScope } from '../lib/api';
export function OperationContextPanel({compact = false, 'data-action': scopeAction}: {compact?: boolean; 'data-action'?: string}) {
 const cache = useQueryClient(); const [ready,setReady] = useState(false); const [saving,setSaving] = useState(false); const [error,setError] = useState('');
 useEffect(() => setReady(true), []);
 const query = useQuery({ queryKey:['operation-context'], queryFn: () => api.getAuthContext(), enabled:ready && Boolean(accessToken.get()), retry:false });
 useEffect(() => { if (query.data && !query.data.selectedScopeId && operationScope.get()) { cache.clear(); operationScope.clear(); } }, [query.data,cache]);
 async function select(id: string) {
  setSaving(true); setError('');
  try { const accepted = await api.postAuthContext({scopeId:id}); await cache.cancelQueries(); cache.clear(); operationScope.set(accepted.scopeId); }
  catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cambiar el ámbito.'); } finally { setSaving(false); }
 }
 if (!ready || query.isPending) return <p role="status">Cargando contexto de operación…</p>;
 if (query.isError) return <p role="alert">No se pudo consultar el contexto de operación. Intente de nuevo.</p>;
 const context = query.data;
 const selected = context.scopes.find(item => item.id === context.selectedScopeId);
 return <section aria-label="Contexto de operación" className="space-y-3 rounded-lg border p-4">
  <p className="font-semibold">{context.displayName}</p><p className="text-sm text-muted-foreground">{context.roles.join(', ')}</p><p>Estado de la cuenta: {context.userStatus}</p>
  {compact ? <><p>{selected?.label ?? 'Seleccione un ámbito para operar'}</p><Link href={${JSON.stringify(home)}}>Cambiar contexto de operación</Link></> : <>
   <label className="block font-medium" htmlFor="operation-scope">{${JSON.stringify(scope.label)}}</label>
   <select id="operation-scope" data-action={scopeAction} className="w-full rounded-md border p-3" disabled={saving || !context.scopes.length} value={context.selectedScopeId ?? ''} onChange={event => { if (event.target.value) void select(event.target.value); }}>
    <option value="">Seleccione…</option>{context.scopes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
   </select>
   {!context.scopes.length ? <p role="status">No tiene ámbitos activos asignados. Contacte al administrador.</p> : !selected ? <p role="status">Seleccione un ámbito autorizado antes de realizar operaciones.</p> : <p role="status">Ámbito actual: {selected.label}</p>}
   {selected ? <dl><div><dt>Estado</dt><dd>{selected.status}</dd></div>{selected.details.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value || 'Sin información'}</dd></div>)}</dl> : null}
   {saving ? <p role="status">Cambiando contexto…</p> : null}
  </>}
  {error ? <p role="alert">{error}</p> : null}
 </section>;
}
`,
      { origin: 'DETERMINISTIC', planElements: elements },
    ),
  ];
  for (const route of plan.routes.filter((route) => route.builtinView === 'ACCOUNT_ACCESS')) {
    const param = route.path.match(/\[([a-zA-Z0-9]+)\]/)?.[1];
    if (!param) throw new Error('Account access view requires an account route parameter.');
    const up = toWebRoot(route.path);
    const labels = route.actions.map((action) => action.label);
    const roleLabel = labels[0] ?? 'Guardar roles',
      permissionLabel = labels[1] ?? 'Guardar permisos del rol',
      scopeLabel = labels[2] ?? 'Guardar ámbitos';
    files.push(
      file(
        pagePath(route.path),
        `'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '${up}lib/api';
import { Button } from '${up}components/ui/button';
const ROLE_OPTIONS = ${JSON.stringify(plan.authentication.roles)} as const;
type AssignedRole = (typeof ROLE_OPTIONS)[number];
export default function AccountAccessPage() {
 const { ${param}: accountId } = useParams<{${param}:string}>(); const cache=useQueryClient();
 const account=useQuery({queryKey:['account-access',accountId],queryFn:()=>api.get${account.name}(accountId),retry:false});
 const roles=useQuery({queryKey:['access-roles'],queryFn:()=>api.list${pluralize(role.name)}()});
 const scopes=useQuery({queryKey:['access-scopes'],queryFn:()=>api.list${pluralize(scopes.name)}()});
 const permissions=useQuery({queryKey:['access-permissions'],queryFn:()=>api.list${pluralize(permission.name)}()});
 const [assignedRoles,setAssignedRoles]=useState<AssignedRole[]>([]),[assignedScopes,setAssignedScopes]=useState<string[]>([]),[selectedRole,setSelectedRole]=useState(''),[grants,setGrants]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const current=account.data;if(current){setAssignedRoles(ROLE_OPTIONS.filter(role=>current.roleNames.includes(role)));setAssignedScopes(current.${scope.accountRelation}Ids);}},[account.data]);
 useEffect(()=>{const current=roles.data?.find(item=>item.id===selectedRole);setGrants(current?.${scope.permissionRelation}Ids ?? []);},[roles.data,selectedRole]);
 async function save(kind:'roles'|'scopes'|'permissions') {
  setBusy(true);setMessage('');setError('');
  try {
   if(kind==='permissions') { if(!selectedRole) throw new Error('Seleccione el rol que desea configurar.'); await api.update${role.name}(selectedRole,{${scope.permissionRelation}Ids:grants}); }
   else await api.update${account.name}(accountId,kind==='roles'?{roleNames:assignedRoles}:{${scope.accountRelation}Ids:assignedScopes});
   await cache.invalidateQueries();setMessage('Cambios guardados. Los permisos se comprueban en cada solicitud.');
  } catch(failure){setError(failure instanceof Error?failure.message:'No se pudo guardar la configuración.');}finally{setBusy(false);}
 }
 if(account.isPending||roles.isPending||scopes.isPending||permissions.isPending)return <p role="status">Cargando configuración de acceso…</p>;
 if(account.isError||roles.isError||scopes.isError||permissions.isError)return <p role="alert">No se pudo consultar la configuración autorizada.</p>;
 return <section className="space-y-6"><h1 className="text-2xl font-semibold">{${JSON.stringify(route.screenName)}}</h1><p>Cuenta: {account.data.${scope.displayNameField}}</p>
  <section className="space-y-3 rounded-lg border p-5"><h2 className="font-semibold">Roles</h2><select aria-label="Roles asignados" multiple className="min-h-32 w-full rounded border p-3" value={assignedRoles} onChange={event=>{const selected=Array.from(event.target.selectedOptions,option=>option.value);setAssignedRoles(ROLE_OPTIONS.filter(role=>selected.includes(role)));}}>${plan.authentication.roles.map((name) => `<option value={${JSON.stringify(name)}}>{${JSON.stringify(name)}}</option>`).join('')}</select><Button disabled={busy||!assignedRoles.length} onClick={()=>void save('roles')} ${actionMarker(roleLabel)}>{${JSON.stringify(roleLabel)}}</Button></section>
  <section className="space-y-3 rounded-lg border p-5"><h2 className="font-semibold">{${JSON.stringify(scope.pluralLabel)}}</h2><select aria-label="Ámbitos asignados" multiple className="min-h-32 w-full rounded border p-3" value={assignedScopes} onChange={event=>setAssignedScopes(Array.from(event.target.selectedOptions,option=>option.value))}>{scopes.data.map(item=><option key={item.id} value={item.id}>{String(item.${scope.labelField})}</option>)}</select><Button disabled={busy} onClick={()=>void save('scopes')} ${actionMarker(scopeLabel)}>{${JSON.stringify(scopeLabel)}}</Button></section>
  <section className="space-y-3 rounded-lg border p-5"><h2 className="font-semibold">Permisos por rol</h2><p>Los cambios se aplican a todas las cuentas del rol. No hay excepciones individuales.</p><select aria-label="Rol a configurar" className="w-full rounded border p-3" value={selectedRole} onChange={event=>setSelectedRole(event.target.value)}><option value="">Seleccione…</option>{roles.data.map(item=><option key={item.id} value={item.id}>{String(item.${local.roleNameField})}</option>)}</select><select aria-label="Permisos del rol" multiple className="min-h-48 w-full rounded border p-3" value={grants} disabled={!selectedRole} onChange={event=>setGrants(Array.from(event.target.selectedOptions,option=>option.value))}>{permissions.data.map(item=><option key={item.id} value={item.id}>{String(item.${scope.permissionOperationField})}</option>)}</select><Button disabled={busy||!selectedRole} onClick={()=>void save('permissions')} ${actionMarker(permissionLabel)}>{${JSON.stringify(permissionLabel)}}</Button></section>
  {message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
 </section>;
}
`,
        { origin: 'DETERMINISTIC', planElements: [`route:${route.path}`, ...elements] },
      ),
    );
  }
  return files;
}
