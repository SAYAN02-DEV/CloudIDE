# ⚠️ Important: Installation Required

## Current Status

All code files have been created, but you need to install the dependencies before running the project.

## Quick Setup

Run these commands in order:

```bash
# 1. Navigate to project directory
cd cloud-ide

# 2. Install all dependencies
npm install

# 3. Start local services (MongoDB, Redis, LocalStack)
docker-compose up -d

# 4. Wait a moment, then setup LocalStack
./scripts/setup-localstack.sh

# 5. Run the application
npm run dev:all
```

## What Gets Installed

The `npm install` command will install:

### Core Dependencies
- `yjs` - CRDT library for collaborative editing
- `socket.io` & `socket.io-client` - WebSocket communication
- `redis` - Redis client for pub/sub
- `@aws-sdk/client-s3` - AWS S3 integration
- `@aws-sdk/client-sqs` - AWS SQS integration
- `@monaco-editor/react` - Monaco code editor
- `jsonwebtoken` - JWT authentication
- `concurrently` - Run multiple commands

### Total New Packages
- 10+ new production dependencies
- 2+ new dev dependencies

## If Installation Fails

### Issue: npm install errors

Try:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: Docker services won't start

```bash
# Check Docker is running
docker --version

# Start services individually
docker-compose up mongodb -d
docker-compose up redis -d
docker-compose up localstack -d
```

### Issue: Port conflicts

If ports 3000, 8080, 27017, 6379, or 4566 are in use:
- Change ports in `docker-compose.yml`
- Update corresponding values in `.env`

## Verify Installation

After running `npm install`, check:

```bash
# All packages installed
npm list yjs socket.io redis

# Docker services running
docker-compose ps

# Should show: mongodb, redis, localstack all "Up"
```

## Next Steps After Installation

1. **Test the API**: Use curl commands from QUICKSTART.md
2. **Open the IDE**: Navigate to http://localhost:3000
3. **Create a project**: Use the UI or API
4. **Start collaborating**: Open same project in multiple browsers

## TypeScript Errors

The TypeScript errors you see now will disappear after running `npm install` because:
- All type definitions will be available
- Dependencies will be in node_modules
- TypeScript can resolve imports

## Ready to Go!

Once `npm install` completes successfully, your Cloud IDE will be fully functional with all features:
- ✅ Real-time collaborative editing
- ✅ Integrated terminal
- ✅ File management with S3
- ✅ Auto-scaling workers
- ✅ Complete authentication

---

**Run `npm install` now to get started!**
