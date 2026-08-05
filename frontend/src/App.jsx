import React, { useEffect, useState, useRef } from 'react'
import L from 'leaflet'
import DOMPurify from 'dompurify'

export default function App(){
  const [events, setEvents] = useState([])
  const [sources, setSources] = useState([])
  const [filterSev, setFilterSev] = useState(1)
  const [q, setQ] = useState('')
  const lastUpdatedRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(null)

  useEffect(()=>{
    // init map
    mapRef.current = L.map('map', { preferCanvas:true }).setView([20,0],2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution: '© OpenStreetMap' }).addTo(mapRef.current)
    markersRef.current = L.layerGroup().addTo(mapRef.current)
  },[])

  useEffect(()=>{
    fetch('/api/events').then(r=>r.json()).then(j=>{ setEvents(j); updateSources(j) })
    const es = new EventSource('/events')
    es.onmessage = e => { try{ const d = JSON.parse(e.data); setEvents(prev=>{ const id = d.id || (d.link||'')+'|'+(d.title||''); if(prev.some(p=> (p.id|| (p.link||'')+'|'+(p.title||'') ) === id)) return prev; const out = [d].concat(prev); updateSources(out); return out.slice(0,1000); }) ; if(lastUpdatedRef.current) lastUpdatedRef.current.textContent = 'Last update: '+ new Date().toLocaleString(); }catch(err){console.warn(err)} }
    es.onerror = ()=> console.warn('SSE error')
    return ()=> es.close()
  },[])

  useEffect(()=>{ // markers
    markersRef.current.clearLayers()
    events.forEach(ev=>{ if(ev.lat && ev.lon){ const color = ev.severity>=4 ? 'red' : ev.severity===3 ? 'orange' : 'blue'; const m = L.circleMarker([ev.lat,ev.lon],{ radius:6, color, fillOpacity:0.8 }).addTo(markersRef.current); m.bindPopup(`<strong>${escapeHtml(ev.title)}</strong><br/>${escapeHtml(ev.source)}`) } })
  },[events])

  function escapeHtml(s){ return String(s||'').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)) }

  function updateSources(arr){ setSources(Array.from(new Set(arr.map(a=>a.source||'unknown')))) }

  const filtered = events.filter(e => e.severity >= filterSev && (e.title.toLowerCase().includes(q.toLowerCase()) || (e.source||'').toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="app">
      <header><h1>Warroom — Remake</h1></header>
      <div className="controls">
        <select value={filterSev} onChange={e=>setFilterSev(Number(e.target.value))}>
          <option value={1}>All</option>
          <option value={3}>Severity ≥ 3</option>
          <option value={4}>Severity ≥ 4</option>
        </select>
        <input placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
        <div className="last" ref={lastUpdatedRef}>Last update: —</div>
      </div>

      <div className="columns">
        <div className="left">
          <div id="map" style={{height:360}}></div>
          <div className="feed">
            <h3>Incident Feed</h3>
            <div className="items">
              {filtered.length===0 ? <div className="empty">No items</div> : filtered.map(ev=> (
                <div className={`item sev-${ev.severity||2}`} key={ev.id||ev.link} tabIndex={0}>
                  <a href={ev.link||'#'} target="_blank" rel="noopener noreferrer">{ev.title||'(no title)'}</a>
                  <div className="meta">{ev.source} — {new Date(ev.timestamp).toLocaleString()}</div>
                  {ev.summary ? <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(ev.summary,{ALLOWED_TAGS:['b','i','em','strong','a','p','ul','ol','li','br']})}} /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="right">
          <h3>Escalations</h3>
          <div className="items">
            {events.filter(e=>e.severity>=4).slice(0,20).map(ev=> (<div key={ev.id} className={`item sev-${ev.severity}`}><a href={ev.link} target="_blank" rel="noreferrer">{ev.title}</a><div className="meta">{ev.source}</div></div>))}
          </div>
          <h4>Sources</h4>
          <ul className="sources">{sources.map(s=> <li key={s}>{s}</li>)}</ul>
        </aside>
      </div>
    </div>
  )
}
