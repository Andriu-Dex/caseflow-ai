import { file, type GeneratedProjectFile } from './types';
export function actionFormFile(): GeneratedProjectFile {
  return file(
    'apps/web/components/action-form.tsx',
    `'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
type Binding={kind:'UUID';field:string}|{kind:'ACTION'|'PREFILL';field:string;sourceEndpoint:string;sourceField:string;requireTrue?:string};
import { createContext, useContext } from 'react';
type Option={id:string;label:string};
const ReferenceContext=createContext<Record<string,Option[]>>({});
function newRequestKey():string {
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
interface Shape { type:string;referenceEntityLocalId?:string;technical?:boolean; minLength?:number;maxLength?:number;minimum?:number;maximum?:number;minItems?:number; description?:string; nullable?:boolean; properties?:{name:string;required?:boolean;value:Shape}[];items?:Shape;enumValues?:string[];maxItems?:number;maxBytes?:number;mimeTypes?:string[];collectionLayout?:'CARDS'|'TABLE';groupBy?:string; }
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const initial=(shape:Shape):unknown=>shape.type==='OBJECT'?Object.fromEntries((shape.properties??[]).map(field=>[field.name,initial(field.value)])):shape.type==='ARRAY'?[]:shape.type==='BOOLEAN'?false:'';
const blank=(value:unknown):boolean=>value===undefined||value===''||Array.isArray(value)&&!value.length||Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(blank));
function normalized(shape:Shape,value:unknown):unknown {
 if(shape.type==='OBJECT')return Object.fromEntries((shape.properties??[]).filter(field=>field.required!==false||!blank(record(value)[field.name])).map(field=>[field.name,normalized(field.value,record(value)[field.name])]));
 if(shape.type==='ARRAY')return (Array.isArray(value)?value:[]).map(item=>normalized(shape.items!,item));
 if(shape.type==='DECIMAL'&&typeof value==='string')return value.trim().includes('.')?value.trim():value.trim().replace(',','.');
 if(shape.type==='INT'&&typeof value==='string'&&/^-?\\d+$/.test(value))return Number(value);
 if(shape.type==='DATETIME'&&typeof value==='string'&&/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value))return new Date(value).toISOString();
 return value;
}
function FileInput({shape,onChange,id,label,disabled}:{shape:Shape;onChange:(value:unknown)=>void;id:string;label:string;disabled:boolean}) {
 const [error,setError]=useState('');const [reading,setReading]=useState(false);
 async function select(file:File|undefined){setError('');onChange(null);if(!file)return;if(file.size===0||file.size>(shape.maxBytes??0)||!shape.mimeTypes?.includes(file.type)){setError('Revise el tipo y tamaño permitido del archivo.');return;}setReading(true);try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);onChange({fileName:file.name,mimeType:file.type,base64:btoa(binary)});}catch{setError('No se pudo leer el archivo.');}finally{setReading(false);}}
 return <div><label htmlFor={id}>{label}</label><input id={id} type="file" accept={shape.mimeTypes?.join(',')} disabled={disabled||reading} onChange={event=>void select(event.target.files?.[0])}/><p>Tamaño máximo: {shape.maxBytes} bytes.</p>{reading?<p role="status">Leyendo archivo…</p>:null}{error?<p role="alert">{error}</p>:null}</div>;
}
function FileDownload({value}:{value:unknown}) {
 const file=record(value);return <Button type="button" variant="outline" onClick={()=>{const bytes=Uint8Array.from(atob(String(file.base64)),char=>char.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:String(file.mimeType)}));const link=document.createElement('a');link.href=url;link.download=String(file.fileName);link.click();URL.revokeObjectURL(url);}}>Descargar {String(file.fileName)}</Button>;
}
function Field({shape,value,onChange,id,label,disabled}:{shape:Shape;value:unknown;onChange:(value:unknown)=>void;id:string;label:string;disabled:boolean}) {
 const references=useContext(ReferenceContext);
 if(shape.type==='FILE')return <FileInput shape={shape} onChange={onChange} id={id} label={label} disabled={disabled}/>;
 if(shape.nullable)return <div><label><input type="checkbox" disabled={disabled} checked={value===null} onChange={event=>onChange(event.target.checked?null:initial({...shape,nullable:false}))}/> Sin valor: {label}</label><Field shape={{...shape,nullable:false}} value={value===null?initial(shape):value} onChange={onChange} id={id} label={label} disabled={disabled||value===null}/></div>;
 if(shape.referenceEntityLocalId)return <div><label htmlFor={id}>{label}</label><select id={id} disabled={disabled} className="w-full rounded border p-2" value={String(value??'')} onChange={event=>onChange(event.target.value)}><option value="">Seleccione…</option>{(references[shape.referenceEntityLocalId]??[]).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></div>;
 if(shape.type==='OBJECT')return <fieldset disabled={disabled} className="space-y-3 rounded border p-3"><legend>{label}</legend>{shape.properties?.map(field=><Field key={field.name} shape={field.value} value={record(value)[field.name]} onChange={next=>onChange({...record(value),[field.name]:next})} id={id+'-'+field.name} label={field.value.description??field.name} disabled={disabled}/>)}</fieldset>;
 if(shape.type==='ARRAY'){const items=Array.isArray(value)?value:[];return <fieldset disabled={disabled} className="space-y-3 rounded border p-3"><legend>{label}</legend>{items.map((item,index)=><div key={index}><Field shape={shape.items!} value={item} onChange={next=>onChange(items.map((current,i)=>i===index?next:current))} id={id+'-'+index} label={'Elemento '+(index+1)} disabled={disabled}/><Button type="button" variant="outline" onClick={()=>onChange(items.filter((_,i)=>i!==index))}>Quitar elemento {index+1}</Button></div>)}<Button type="button" variant="outline" disabled={disabled||items.length>=(shape.maxItems??1000)} onClick={()=>onChange([...items,initial(shape.items!)])}>Agregar elemento</Button></fieldset>}
 if(shape.type==='BOOLEAN')return <label htmlFor={id}><input id={id} type="checkbox" disabled={disabled} checked={value===true} onChange={event=>onChange(event.target.checked)}/> {label}</label>;
 return <div><label htmlFor={id}>{label}</label>{shape.type==='ENUM'?<select id={id} disabled={disabled} value={String(value??'')} onChange={event=>onChange(event.target.value)} className="w-full rounded border p-2"><option value="">Seleccione…</option>{shape.enumValues?.map(option=><option key={option}>{option}</option>)}</select>:<input id={id} disabled={disabled} className="w-full rounded border p-2" type={shape.type==='DATE'?'date':shape.type==='DATETIME'?'datetime-local':shape.type==='INT'?'number':'text'} inputMode={shape.type==='DECIMAL'?'decimal':undefined} value={String(value??'')} onChange={event=>onChange(event.target.value)}/>}</div>;
}
function CollectionResult({value,shape,timeZone}:{value:unknown[];shape:Shape;timeZone?:string}):ReactNode {
 if(!value.length)return <span>Sin registros</span>;
 const columns=(shape.items?.properties??[]).filter(field=>!field.value.technical);
 const groups=new Map<string,unknown[]>();
 for(const row of value){const group=shape.groupBy?String(record(row)[shape.groupBy]??'Sin información'):'';const items=groups.get(group)??[];items.push(row);groups.set(group,items);}
 return <div className="space-y-6" data-collection-layout={shape.collectionLayout}>{[...groups].map(([group,rows],groupIndex)=><section key={groupIndex} data-result-group={group} className="space-y-3">{shape.groupBy?<h4 className="font-semibold">{group}</h4>:null}{shape.collectionLayout==='CARDS'?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((row,index)=><article key={index} className="rounded-xl border bg-card p-4"><Result value={row} shape={shape.items!} timeZone={timeZone}/></article>)}</div>:<div className="overflow-x-auto rounded border"><table className="w-full text-sm"><thead><tr>{columns.map(field=><th key={field.name} scope="col" className="px-3 py-2 text-left">{field.value.description??field.name}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index} className="border-t">{columns.map(field=><td key={field.name} className="px-3 py-2 align-top"><Result value={record(row)[field.name]} shape={field.value} timeZone={timeZone}/></td>)}</tr>)}</tbody></table></div>}</section>)}</div>;
}
type Navigation={label:string;routePath:string;idField:string;collectionField?:string;sourceEndpoint?:string};
const NavigationContext=createContext<Navigation[]>([]);
function NavigationLinks({data,definitions}:{data:Record<string,unknown>;definitions:Navigation[]}){return <>{definitions.map((navigation,index)=>typeof data[navigation.idField]==='string'?<a key={index} data-action={navigation.label} className="text-primary underline" href={navigation.routePath.replace(/\\[[a-z][a-zA-Z0-9]*\\]/,encodeURIComponent(String(data[navigation.idField])))}>{navigation.label}</a>:null)}</>;}
function Result({value,shape,timeZone,fieldName}:{value:unknown;shape:Shape;timeZone?:string;fieldName?:string}):ReactNode {
 const navigation=useContext(NavigationContext).filter(item=>item.collectionField===fieldName&&fieldName!==undefined);
 if(value===null||value===undefined)return <span>Sin información</span>;
 if(shape.type==='FILE')return <FileDownload value={value}/>;
 const zone=typeof record(value).timeZone==='string'?String(record(value).timeZone):timeZone;
 if(Array.isArray(value)&&navigation.length)return <ul className="space-y-3">{value.map((item,index)=><li key={index}><Result value={item} shape={shape.items??{type:'STRING'}} timeZone={timeZone}/><NavigationLinks data={record(item)} definitions={navigation}/></li>)}</ul>;
 if(Array.isArray(value)&&shape.collectionLayout&&shape.items?.type==='OBJECT')return <CollectionResult value={value} shape={shape} timeZone={zone}/>;
 if(shape.type==='DATETIME'&&zone&&typeof value==='string'){try{const formatted=new Intl.DateTimeFormat('es',{timeZone:zone,dateStyle:'medium',timeStyle:'short',hourCycle:'h23'}).format(new Date(value));return <time dateTime={value} title={value}>{formatted+' · '+zone}</time>;}catch{return <span>{value}</span>;}}
 if(Array.isArray(value))return value.length?<ul className="space-y-2">{value.map((item,index)=><li key={index}><Result value={item} shape={shape.items??{type:'STRING'}} timeZone={zone}/></li>)}</ul>:<span>Sin registros</span>;
 if(typeof value==='object')return <dl className="space-y-2">{Object.entries(value).filter(([name])=>!shape.properties?.find(field=>field.name===name)?.value.technical).map(([name,item])=>{const field=shape.properties?.find(field=>field.name===name);return <div key={name}><dt className="font-medium">{field?.value.description??name}</dt><dd><Result value={item} shape={field?.value??{type:'STRING'}} timeZone={zone} fieldName={name}/></dd></div>})}</dl>;
 return <span>{typeof value==='boolean'?(value?'Sí':'No'):String(value)}</span>;
}
const ActionContext=createContext<{controls:ReactNode;feedback:ReactNode;hasFeedback:boolean;result:unknown;responseDefinition:Shape}|null>(null);
function useActionContext(){const value=useContext(ActionContext);if(!value)throw new Error('Action components require their operation context.');return value;}
export function ActionControls({className}:{className?:string}){return <div className={className}>{useActionContext().controls}</div>;}
export function ActionFeedback({className}:{className?:string}){const context=useActionContext();return context.hasFeedback?<div className={className}>{context.feedback}</div>:null;}
export function ActionResult({field,className}:{field?:string;className?:string}){const context=useActionContext();if(context.result===undefined)return null;const definition=field?context.responseDefinition.properties?.find(item=>item.name===field):undefined;if(field&&(!definition||definition.value.technical))return null;const zone=typeof record(context.result).timeZone==='string'?String(record(context.result).timeZone):undefined;return <div className={className} role="status">{field?<><h3 className="font-semibold">{definition!.value.description??field}</h3><Result value={record(context.result)[field]} shape={definition!.value} timeZone={zone} fieldName={field}/></>:<Result value={context.result} shape={context.responseDefinition}/>}</div>;}
export function ActionForm({label,bodyDefinition,queryDefinition,responseDefinition,submit,onDone,references={},bindings=[],navigations=[],autoLoad=false,actionKey,isMutation=false,successNavigation,description,children,className='space-y-4 rounded border p-4','data-action': marker=label}:{description?:string;children?:ReactNode;className?:string;'data-action'?:string;label:string;actionKey:string;isMutation?:boolean;bindings?:Binding[];navigations?:Navigation[];autoLoad?:boolean;successNavigation?:{routePath:string;idField:string};bodyDefinition?:Shape;queryDefinition?:Shape;responseDefinition:Shape;references?:Record<string,()=>Promise<Option[]>>;submit:(body:unknown,query:unknown)=>Promise<unknown>;onDone?:()=>void}) {

 const cache=useQueryClient();const pathname=usePathname();const router=useRouter();const scope=typeof window==='undefined'?'':window.sessionStorage.getItem('operation-scope')??'';
 const resultKey=['action-result',scope,pathname,actionKey];const dirtyKey=['action-dirty',scope,pathname];
 const dirty=useQuery({queryKey:dirtyKey,queryFn:async()=>({} as Record<string,boolean>),enabled:false});
 const [generated,setGenerated]=useState<Record<string,unknown>>({});
 const bindingsKey=JSON.stringify(bindings);useEffect(()=>{const definitions=JSON.parse(bindingsKey) as Binding[];setGenerated(Object.fromEntries(definitions.filter(binding=>binding.kind==='UUID').map(binding=>[binding.field,newRequestKey()])));},[bindingsKey,pathname,scope,actionKey]);
 const sourceBindings=bindings.filter((binding):binding is Extract<Binding,{kind:'ACTION'|'PREFILL'}>=>binding.kind==='ACTION'||binding.kind==='PREFILL');
 const sourceValues=useQueries({queries:sourceBindings.map(binding=>({queryKey:['action-result',scope,pathname,binding.sourceEndpoint],queryFn:async()=>null as unknown,enabled:false}))});
 const bound={...generated,...Object.fromEntries(sourceBindings.flatMap((binding,index)=>binding.kind==='ACTION'&&sourceValues[index]?.data!==undefined?[[binding.field,record(sourceValues[index]?.data)[binding.sourceField]]]:[]))};
 const blocked=sourceBindings.some((binding,index)=>binding.requireTrue&&sourceValues[index]?.data!==undefined&&record(sourceValues[index]?.data)[binding.requireTrue]!==true);
 const prefilled=Object.fromEntries(sourceBindings.flatMap((binding,index)=>binding.kind==='PREFILL'&&sourceValues[index]?.data!==undefined?[[binding.field,record(sourceValues[index]?.data)[binding.sourceField]]]:[]));
 const hasPrefill=sourceBindings.some(binding=>binding.kind==='PREFILL');
 const missing=bindings.some(binding=>(binding.kind==='PREFILL'?prefilled[binding.field]:bound[binding.field])===undefined);
 const dirtyOther=bindings.some(binding=>binding.kind==='ACTION')&&Object.entries(dirty.data??{}).some(([key,value])=>key!==actionKey&&value);
 const resultQuery=useQuery({queryKey:resultKey,queryFn:async()=>null as unknown,enabled:false});const result=resultQuery.data;
 const names=Object.keys(references);const options=useQueries({queries:names.map(name=>({queryKey:['action-reference',scope,name],queryFn:references[name]!}))});
 const filterKey=['action-query',scope,pathname,actionKey];
 const filterState=useQuery({queryKey:filterKey,queryFn:async()=>null as unknown,enabled:false});
 const query=filterState.data??(queryDefinition?initial(queryDefinition):undefined);
 const setQuery=(value:unknown)=>cache.setQueryData(filterKey,value);
 const id=useId();const[body,setBody]=useState(()=>bodyDefinition?initial(bodyDefinition):undefined);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 const localDirty=Boolean(dirty.data?.[actionKey]);
 const prefillKey=JSON.stringify({prefilled,source:sourceBindings.filter(binding=>binding.kind==='ACTION').map(binding=>bound[binding.field])});
 const [prefillOrigin,setPrefillOrigin]=useState<string>();
 const prefillStale=hasPrefill&&localDirty&&prefillOrigin!==prefillKey;
 const contextKey=JSON.stringify([pathname,scope,actionKey]);
 useEffect(()=>{setBody(bodyDefinition?initial(bodyDefinition):undefined);setPrefillOrigin(undefined);},[contextKey]);
 useEffect(()=>{if(hasPrefill&&!localDirty&&!missing){setBody((current: unknown)=>({...record(current),...record(JSON.parse(prefillKey).prefilled)}));setPrefillOrigin(prefillKey);}},[hasPrefill,localDirty,missing,prefillKey,contextKey]);
 function changed(){cache.resetQueries({queryKey:resultKey,exact:true});if(isMutation)cache.setQueryData<Record<string,boolean>>(dirtyKey,current=>({...current,[actionKey]:true}));}
 async function run(){const token=window.sessionStorage.getItem('access-token');const submittedQuery=queryDefinition?JSON.stringify(normalized(queryDefinition,query)):undefined;setBusy(true);setError('');cache.resetQueries({queryKey:resultKey,exact:true});try{
  const result=await submit(bodyDefinition?{...record(normalized(bodyDefinition,body)),...bound}:undefined,queryDefinition?normalized(queryDefinition,query):undefined);
  if(token!==window.sessionStorage.getItem('access-token')||scope!==(window.sessionStorage.getItem('operation-scope')??'')||pathname!==window.location.pathname)return;
  if(queryDefinition&&submittedQuery!==JSON.stringify(normalized(queryDefinition,cache.getQueryData(filterKey)??initial(queryDefinition))))return;
  if(isMutation){await cache.cancelQueries({queryKey:['action-result',scope,pathname]});await cache.resetQueries({queryKey:['action-result',scope,pathname]});cache.setQueryData<Record<string,boolean>>(dirtyKey,current=>({...current,[actionKey]:false}));}
  cache.setQueryData(resultKey,result);if(isMutation)setGenerated(Object.fromEntries(bindings.filter(binding=>binding.kind==='UUID').map(binding=>[binding.field,newRequestKey()])));onDone?.();
  if(successNavigation){const id=record(result)[successNavigation.idField];if(typeof id==='string')router.push(successNavigation.routePath.replace(/\\[[a-z][a-zA-Z0-9]*\\]/,encodeURIComponent(id)));}
 }catch(failure){setError(failure instanceof Error&&failure.name!=='ZodError'?failure.message:'Revise los campos de la operación.');}finally{setBusy(false)}}
 const visibleBody=bodyDefinition?{...bodyDefinition,properties:bodyDefinition.properties?.filter(field=>!bindings.some(binding=>binding.kind!=='PREFILL'&&binding.field===field.name))}:undefined;
 const autoLoaded=useRef<string|undefined>(undefined);
 useEffect(()=>{if(autoLoad&&!missing&&autoLoaded.current!==contextKey){autoLoaded.current=contextKey;void run();}},[autoLoad,missing,contextKey]);
 const controls=<><h2 className="font-semibold">{label}</h2>{description?<p role="note" className="text-sm text-muted-foreground">{description}</p>:null}{visibleBody?.properties?.length?<Field shape={visibleBody} value={body} onChange={next=>{setBody(next);changed()}} id={id+'-body'} label="Datos de la operación" disabled={busy||(hasPrefill&&missing)}/>:null}{queryDefinition?<Field shape={queryDefinition} value={query} onChange={next=>{setQuery(next);changed()}} id={id+'-query'} label="Filtros" disabled={busy}/>:null}<Button type="button" data-action={marker} disabled={busy||missing||blocked||dirtyOther||prefillStale||options.some(query=>query.isPending||query.isError)} onClick={()=>void run()}>{busy?'Procesando…':autoLoad?'Actualizar información':label}</Button></>;
 const feedback=<>{prefillStale?<div role="alert"><p>La consulta cambió mientras editaba. Revise los datos antes de guardar.</p><Button type="button" onClick={()=>{setBody((current: unknown)=>({...record(current),...prefilled}));setPrefillOrigin(prefillKey);cache.setQueryData<Record<string,boolean>>(dirtyKey,current=>({...current,[actionKey]:false}));}}>Descartar cambios locales y recargar</Button></div>:null}{options.some(query=>query.isError)?<p role="alert">No se pudieron cargar las opciones autorizadas.</p>:null}{blocked?<p role="status">La operación ya no admite esta acción.</p>:missing?<p role="status">Primero revise la operación para habilitar esta acción.</p>:dirtyOther?<p role="status">Guarde los cambios pendientes antes de continuar.</p>:null}{error?<p role="alert">{error}</p>:null}</>;
 return <NavigationContext.Provider value={navigations}><ReferenceContext.Provider value={Object.fromEntries(names.map((name,index)=>[name,options[index]?.data??[]]))}><ActionContext.Provider value={{controls,feedback,hasFeedback:Boolean(error||blocked||missing||dirtyOther||prefillStale||options.some(query=>query.isError)),result,responseDefinition}}><section className={className}>{children??<><ActionControls/><ActionFeedback/><ActionResult/></>}<NavigationLinks data={record(result)} definitions={navigations.filter(item=>!item.collectionField)}/></section></ActionContext.Provider></ReferenceContext.Provider></NavigationContext.Provider>;
}
`,
    { origin: 'DETERMINISTIC', planElements: ['action-contract:forms'] },
  );
}
