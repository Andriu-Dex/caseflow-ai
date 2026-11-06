import { file, type GeneratedProjectFile } from './types';
export function actionFormFile(): GeneratedProjectFile {
  return file(
    'apps/web/components/action-form.tsx',
    `'use client';
import { useId, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
type Binding={kind:'UUID';field:string}|{kind:'ACTION';field:string;sourceEndpoint:string;sourceField:string;requireTrue?:string};
import { createContext, useContext } from 'react';
type Option={id:string;label:string};
const ReferenceContext=createContext<Record<string,Option[]>>({});
function newRequestKey():string {
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
interface Shape { type:string;referenceEntityLocalId?:string;technical?:boolean; minLength?:number;maxLength?:number;minimum?:number;maximum?:number;minItems?:number; description?:string; nullable?:boolean; properties?:{name:string;required?:boolean;value:Shape}[];items?:Shape;enumValues?:string[];maxItems?:number; }
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
function Field({shape,value,onChange,id,label,disabled}:{shape:Shape;value:unknown;onChange:(value:unknown)=>void;id:string;label:string;disabled:boolean}) {
 const references=useContext(ReferenceContext);
 if(shape.nullable)return <div><label><input type="checkbox" disabled={disabled} checked={value===null} onChange={event=>onChange(event.target.checked?null:initial({...shape,nullable:false}))}/> Sin valor: {label}</label><Field shape={{...shape,nullable:false}} value={value===null?initial(shape):value} onChange={onChange} id={id} label={label} disabled={disabled||value===null}/></div>;
 if(shape.referenceEntityLocalId)return <div><label htmlFor={id}>{label}</label><select id={id} disabled={disabled} className="w-full rounded border p-2" value={String(value??'')} onChange={event=>onChange(event.target.value)}><option value="">Seleccione…</option>{(references[shape.referenceEntityLocalId]??[]).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></div>;
 if(shape.type==='OBJECT')return <fieldset disabled={disabled} className="space-y-3 rounded border p-3"><legend>{label}</legend>{shape.properties?.map(field=><Field key={field.name} shape={field.value} value={record(value)[field.name]} onChange={next=>onChange({...record(value),[field.name]:next})} id={id+'-'+field.name} label={field.value.description??field.name} disabled={disabled}/>)}</fieldset>;
 if(shape.type==='ARRAY'){const items=Array.isArray(value)?value:[];return <fieldset disabled={disabled} className="space-y-3 rounded border p-3"><legend>{label}</legend>{items.map((item,index)=><div key={index}><Field shape={shape.items!} value={item} onChange={next=>onChange(items.map((current,i)=>i===index?next:current))} id={id+'-'+index} label={'Elemento '+(index+1)} disabled={disabled}/><Button type="button" variant="outline" onClick={()=>onChange(items.filter((_,i)=>i!==index))}>Quitar elemento {index+1}</Button></div>)}<Button type="button" variant="outline" disabled={disabled||items.length>=(shape.maxItems??1000)} onClick={()=>onChange([...items,initial(shape.items!)])}>Agregar elemento</Button></fieldset>}
 if(shape.type==='BOOLEAN')return <label htmlFor={id}><input id={id} type="checkbox" disabled={disabled} checked={value===true} onChange={event=>onChange(event.target.checked)}/> {label}</label>;
 return <div><label htmlFor={id}>{label}</label>{shape.type==='ENUM'?<select id={id} disabled={disabled} value={String(value??'')} onChange={event=>onChange(event.target.value)} className="w-full rounded border p-2"><option value="">Seleccione…</option>{shape.enumValues?.map(option=><option key={option}>{option}</option>)}</select>:<input id={id} disabled={disabled} className="w-full rounded border p-2" type={shape.type==='DATE'?'date':shape.type==='DATETIME'?'datetime-local':shape.type==='INT'?'number':'text'} inputMode={shape.type==='DECIMAL'?'decimal':undefined} value={String(value??'')} onChange={event=>onChange(event.target.value)}/>}</div>;
}
function Result({value,shape}:{value:unknown;shape:Shape}):ReactNode {
 if(value===null||value===undefined)return <span>Sin información</span>;
 if(Array.isArray(value))return value.length?<ul className="space-y-2">{value.map((item,index)=><li key={index}><Result value={item} shape={shape.items??{type:'STRING'}}/></li>)}</ul>:<span>Sin registros</span>;
 if(typeof value==='object')return <dl className="space-y-2">{Object.entries(value).filter(([name])=>!shape.properties?.find(field=>field.name===name)?.value.technical).map(([name,item])=>{const field=shape.properties?.find(field=>field.name===name);return <div key={name}><dt className="font-medium">{field?.value.description??name}</dt><dd><Result value={item} shape={field?.value??{type:'STRING'}}/></dd></div>})}</dl>;
 return <span>{typeof value==='boolean'?(value?'Sí':'No'):String(value)}</span>;
}
export function ActionForm({label,bodyDefinition,queryDefinition,responseDefinition,submit,onDone,references={},bindings=[],actionKey,isMutation=false,successNavigation,'data-action': marker=label}:{'data-action'?:string;label:string;actionKey:string;isMutation?:boolean;bindings?:Binding[];successNavigation?:{routePath:string;idField:string};bodyDefinition?:Shape;queryDefinition?:Shape;responseDefinition:Shape;references?:Record<string,()=>Promise<Option[]>>;submit:(body:unknown,query:unknown)=>Promise<unknown>;onDone?:()=>void}) {

 const cache=useQueryClient();const pathname=usePathname();const router=useRouter();const scope=typeof window==='undefined'?'':window.sessionStorage.getItem('operation-scope')??'';
 const resultKey=['action-result',scope,pathname,actionKey];const dirtyKey=['action-dirty',scope,pathname];
 const dirty=useQuery({queryKey:dirtyKey,queryFn:async()=>({} as Record<string,boolean>),enabled:false});
 const [generated,setGenerated]=useState<Record<string,unknown>>({});
 const bindingsKey=JSON.stringify(bindings);useEffect(()=>{const definitions=JSON.parse(bindingsKey) as Binding[];setGenerated(Object.fromEntries(definitions.filter(binding=>binding.kind==='UUID').map(binding=>[binding.field,newRequestKey()])));},[bindingsKey,pathname,scope,actionKey]);
 const sourceBindings=bindings.filter((binding):binding is Extract<Binding,{kind:'ACTION'}>=>binding.kind==='ACTION');
 const sourceValues=useQueries({queries:sourceBindings.map(binding=>({queryKey:['action-result',scope,pathname,binding.sourceEndpoint],queryFn:async()=>null as unknown,enabled:false}))});
 const bound={...generated,...Object.fromEntries(sourceBindings.flatMap((binding,index)=>sourceValues[index]?.data!==undefined?[[binding.field,record(sourceValues[index]?.data)[binding.sourceField]]]:[]))};
 const blocked=sourceBindings.some((binding,index)=>binding.requireTrue&&sourceValues[index]?.data!==undefined&&record(sourceValues[index]?.data)[binding.requireTrue]!==true);
 const missing=bindings.some(binding=>bound[binding.field]===undefined);
 const dirtyOther=bindings.some(binding=>binding.kind==='ACTION')&&Object.entries(dirty.data??{}).some(([key,value])=>key!==actionKey&&value);
 const resultQuery=useQuery({queryKey:resultKey,queryFn:async()=>null as unknown,enabled:false});const result=resultQuery.data;
 const names=Object.keys(references);const options=useQueries({queries:names.map(name=>({queryKey:['action-reference',scope,name],queryFn:references[name]!}))});
 const id=useId();const[body,setBody]=useState(()=>bodyDefinition?initial(bodyDefinition):undefined);const[query,setQuery]=useState(()=>queryDefinition?initial(queryDefinition):undefined);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 function changed(){cache.resetQueries({queryKey:resultKey,exact:true});if(isMutation)cache.setQueryData<Record<string,boolean>>(dirtyKey,current=>({...current,[actionKey]:true}));}
 async function run(){const token=window.sessionStorage.getItem('access-token');setBusy(true);setError('');cache.resetQueries({queryKey:resultKey,exact:true});try{
  const result=await submit(bodyDefinition?{...record(normalized(bodyDefinition,body)),...bound}:undefined,queryDefinition?normalized(queryDefinition,query):undefined);
  if(token!==window.sessionStorage.getItem('access-token')||scope!==(window.sessionStorage.getItem('operation-scope')??'')||pathname!==window.location.pathname)return;
  if(isMutation){await cache.cancelQueries({queryKey:['action-result',scope,pathname]});await cache.resetQueries({queryKey:['action-result',scope,pathname]});cache.setQueryData<Record<string,boolean>>(dirtyKey,current=>({...current,[actionKey]:false}));}
  cache.setQueryData(resultKey,result);if(isMutation)setGenerated(Object.fromEntries(bindings.filter(binding=>binding.kind==='UUID').map(binding=>[binding.field,newRequestKey()])));onDone?.();
  if(successNavigation){const id=record(result)[successNavigation.idField];if(typeof id==='string')router.push(successNavigation.routePath.replace(/\\[[a-z][a-zA-Z0-9]*\\]/,encodeURIComponent(id)));}
 }catch(failure){setError(failure instanceof Error&&failure.name!=='ZodError'?failure.message:'Revise los campos de la operación.');}finally{setBusy(false)}}
 const visibleBody=bodyDefinition?{...bodyDefinition,properties:bodyDefinition.properties?.filter(field=>!bindings.some(binding=>binding.field===field.name))}:undefined;
 return <ReferenceContext.Provider value={Object.fromEntries(names.map((name,index)=>[name,options[index]?.data??[]]))}><section className="space-y-4 rounded border p-4">{options.some(query=>query.isError)?<p role="alert">No se pudieron cargar las opciones autorizadas.</p>:null}<h2 className="font-semibold">{label}</h2>{visibleBody?.properties?.length?<Field shape={visibleBody} value={body} onChange={next=>{setBody(next);changed()}} id={id+'-body'} label="Datos de la operación" disabled={busy}/>:null}{queryDefinition?<Field shape={queryDefinition} value={query} onChange={next=>{setQuery(next);changed()}} id={id+'-query'} label="Filtros" disabled={busy}/>:null}<Button type="button" data-action={marker} disabled={busy||missing||blocked||dirtyOther||options.some(query=>query.isPending||query.isError)} onClick={()=>void run()}>{busy?'Procesando…':label}</Button>{blocked?<p role="status">La operación ya no admite esta acción.</p>:missing?<p role="status">Primero revise la operación para habilitar esta acción.</p>:dirtyOther?<p role="status">Guarde los cambios pendientes antes de continuar.</p>:null}{error?<p role="alert">{error}</p>:null}{result!==undefined?<div role="status"><Result value={result} shape={responseDefinition}/></div>:null}</section></ReferenceContext.Provider>;
}
`,
    { origin: 'DETERMINISTIC', planElements: ['action-contract:forms'] },
  );
}
