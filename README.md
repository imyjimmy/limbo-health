## Networking

**Inside Docker Network:**
- `admin-frontend` container: Vite dev server on port **5173** (internal only)
- `mgit-api` container: Server on port **3003** (internal only)
- `scheduler-api` container: Server on port **3005** (internal only)
- `gateway` container: nginx on port **80** (internal), exposed to host as **3003**

**Gateway Routing (nginx):**
```
localhost:3003/          → admin_frontend:5173 (Vite)
localhost:3003/api/*     → scheduler_api:3005
localhost:3003/api/mgit/* → mgit_api:3003
```

## Why localhost:5173 Shows Nothing

Port 5173 is **NOT exposed** to your host machine. It's only accessible inside the Docker network. The gateway container proxies requests to `admin_frontend:5173` internally.

**Check your docker-compose.development.yml:**
```yaml
admin-frontend:
  # NO ports section = not exposed to host
  # Only gateway can reach it on internal port 5173
```

## This is Correct! ✅

- ✅ `localhost:3003` → admin-frontend (through gateway)
- ✅ Hot reload works (Vite watches files via volume mount)
- ✅ API calls work (gateway proxies to backend services)

**The architecture is working as designed!** All traffic goes through the gateway, just like production.

Want to test that everything is connected? Try accessing an API endpoint through the gateway.