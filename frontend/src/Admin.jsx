import React, { useState, useEffect } from 'react'

export default function Admin(){
  const [token, setToken] = useState('')
  const [feeds, setFeeds] = useState([])
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState(null)

  async function loadFeeds() {
    try {
      const res = await fetch('/admin/feeds', { headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Unauthorized');
      const j = await res.json();
      setFeeds(j);
      setError(null);
    } catch (e) { setError(e.message); setFeeds([]); }
  }

  async function addFeed() {
    try {
      const res = await fetch('/admin/feeds', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin-token': token }, body: JSON.stringify({ url, source }) });
      if (!res.ok) throw new Error('Add failed');
      setUrl(''); setSource('');
      await loadFeeds();
    } catch (e) { setError(e.message); }
  }

  async function removeFeed(id) {
    try {
      const res = await fetch('/admin/feeds/'+id, { method: 'DELETE', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Delete failed');
      await loadFeeds();
    } catch (e) { setError(e.message); }
  }

  return (
    <div style={{ padding:20 }}>
      <h2>Admin — Feeds</h2>
      <div style={{ marginBottom:12 }}>
        <label>Admin token: <input value={token} onChange={e=>setToken(e.target.value)} style={{ width:400 }} /></label>
        <button onClick={loadFeeds} style={{ marginLeft:8 }}>Load feeds</button>
      </div>
      {error ? <div style={{ color:'salmon' }}>{error}</div> : null}
      <div style={{ marginTop:10 }}>
        <input placeholder="Feed URL" value={url} onChange={e=>setUrl(e.target.value)} style={{ width:400 }} />
        <input placeholder="Source name (optional)" value={source} onChange={e=>setSource(e.target.value)} style={{ marginLeft:8 }} />
        <button onClick={addFeed} style={{ marginLeft:8 }}>Add</button>
      </div>
      <div style={{ marginTop:20 }}>
        <h3>Configured feeds</h3>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr><th>ID</th><th>URL</th><th>Source</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {feeds.map(f=> (
              <tr key={f.id} style={{ borderTop:'1px solid #ddd' }}>
                <td>{f.id}</td>
                <td style={{ maxWidth:600, overflow:'hidden', textOverflow:'ellipsis' }}>{f.url}</td>
                <td>{f.source}</td>
                <td>{String(f.active)}</td>
                <td><button onClick={()=>removeFeed(f.id)}>Disable</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
