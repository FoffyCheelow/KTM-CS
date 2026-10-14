export async function api<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const res=await fetch(url,{method:method || (body===undefined?'GET':'POST'),headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();if(!res.ok) throw new Error(data.error || 'Something went wrong.');return data;
}
