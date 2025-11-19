import React, { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import dayjs from 'dayjs'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

function Login({ onLogin }) {
  const [name, setName] = useState('')
  const submit = async () => {
    if (!name) return alert('enter a username')
    const res = await fetch(SERVER + '/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: name }) })
    const data = await res.json()
    onLogin(data)
  }
  return (
    <div className="login">
      <h2>Enter a username</h2>
      <input placeholder="username" value={name} onChange={e=>setName(e.target.value)} />
      <button onClick={submit}>Join</button>
    </div>
  )
}

function Chat({ auth }) {
  const [socket, setSocket] = useState(null)
  const [messages, setMessages] = useState([])
  const [online, setOnline] = useState([])
  const [text, setText] = useState('')
  const [typingUsers, setTypingUsers] = useState({})
  const msgRef = useRef()

  useEffect(() => {
    const s = io(SERVER, { auth: { token: auth.token } })
    setSocket(s)
    s.on('connect_error', (err) => {
      console.error('socket error', err.message)
    })
    s.on('load-messages', (msgs) => setMessages(msgs))
    s.on('new-message', (m) => setMessages(prev => [...prev, m]))
    s.on('private-message', (m) => setMessages(prev => [...prev, m]))
    s.on('message-updated', (m) => setMessages(prev => prev.map(x => x.id===m.id?m:x)))
    s.on('online-users', (list) => setOnline(list))
    s.on('typing', ({ fromName, isTyping }) => {
      setTypingUsers(prev => ({ ...prev, [fromName]: isTyping }))
      setTimeout(()=> setTypingUsers(prev => ({ ...prev, [fromName]: false })), 3000)
    })
    s.on('notification', (n) => {
      // simple sound notification
      const audio = new Audio()
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
      audio.play().catch(()=>{})
    })
    return () => s.disconnect()
  }, [auth])

  const send = () => {
    if (!text.trim()) return
    socket.emit('send-message', { room: 'global', text }, (ack) => {
      // optional ack handling
    })
    setText('')
    socket.emit('typing', { room:'global', isTyping:false })
  }

  const handleTyping = (v) => {
    setText(v)
    socket.emit('typing', { room:'global', isTyping: v.length>0 })
  }

  return (
    <div className="chat">
      <aside className="sidebar">
        <h3>Online Users</h3>
        <ul>
          {online.map(u => <li key={u}>{u}</li>)}
        </ul>
      </aside>
      <main className="main">
        <div className="messages" ref={msgRef}>
          {messages.map(m => (
            <div key={m.id} className={'message ' + (m.from===auth.userId? 'mine':'')}>
              <div className="meta">{m.fromName} • {dayjs(m.timestamp).format('HH:mm')}</div>
              <div className="text">{m.text}</div>
              <div className="reactions">
                {Object.entries(m.reactions || {}).map(([r, users]) => <span key={r}>{r} {users.length}</span>)}
                <button onClick={()=> socket.emit('add-reaction', { messageId: m.id, reaction: '👍' })}>👍</button>
                <button onClick={()=> socket.emit('mark-read', { messageId: m.id })}>Mark read</button>
              </div>
            </div>
          ))}
        </div>

        <div className="composer">
          <input value={text} onChange={e=>handleTyping(e.target.value)} onKeyDown={e=> e.key==='Enter' && send()} placeholder="Type a message..." />
          <button onClick={send}>Send</button>
        </div>

        <div className="typing">
          {Object.entries(typingUsers).filter(([k,v])=>v).map(([k])=> <div key={k}>{k} is typing...</div>)}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)
  if (!auth) return <Login onLogin={(data)=> setAuth(data)} />
  return <Chat auth={auth} />
}
