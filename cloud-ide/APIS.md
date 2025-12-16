# Cloud IDE - API Documentation

Complete API reference for testing with Postman or curl.

## Base URL
```
http://localhost:3000
```

---

## Authentication APIs

### 1. Register User
Create a new user account.

**Endpoint:** `POST /api/v1/signup`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "67890abcdef",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

### 2. Login (Legacy)
Login and get user info (no JWT).

**Endpoint:** `POST /api/v1/signin`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "You are signed in",
  "user": {
    "id": "67890abcdef",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

---

### 3. Login with JWT ⭐
Login and get JWT token for API authentication.

**Endpoint:** `POST /api/v2/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "67890abcdef",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

**⚠️ Save the `token` - you'll need it for all other API calls!**

---

## Project Management APIs

### 4. List Projects
Get all projects for the authenticated user.

**Endpoint:** `GET /api/v2/projects`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200):**
```json
{
  "projects": [
    {
      "id": "abc123",
      "name": "My Project",
      "description": "A test project",
      "stack": "React",
      "language": "JavaScript",
      "forks": 0,
      "createdAt": "2025-12-15T10:30:00.000Z",
      "updatedAt": "2025-12-15T10:30:00.000Z"
    }
  ]
}
```

**cURL:**
```bash
curl http://localhost:3000/api/v2/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 5. Create Project
Create a new project.

**Endpoint:** `POST /api/v2/projects`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Body:**
```json
{
  "name": "My Awesome Project",
  "description": "Building something cool",
  "stack": "React",
  "language": "JavaScript"
}
```

**Available Stacks:**
- `React`
- `Node.js`
- `Python`
- `Vue`
- `TypeScript`
- `Other`

**Response (201):**
```json
{
  "message": "Project created successfully",
  "project": {
    "id": "abc123",
    "name": "My Awesome Project",
    "description": "Building something cool",
    "stack": "React",
    "language": "JavaScript"
  }
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/v2/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "My Awesome Project",
    "description": "Building something cool",
    "stack": "React",
    "language": "JavaScript"
  }'
```

---

### 6. Get Project Details
Get details of a specific project including file list.

**Endpoint:** `GET /api/v2/projects/:id`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200):**
```json
{
  "project": {
    "id": "abc123",
    "name": "My Project",
    "description": "A test project",
    "stack": "React",
    "language": "JavaScript",
    "forks": 0,
    "createdAt": "2025-12-15T10:30:00.000Z",
    "updatedAt": "2025-12-15T10:30:00.000Z"
  },
  "files": [
    {
      "path": "README.md",
      "size": 256,
      "lastModified": "2025-12-15T10:30:00.000Z"
    },
    {
      "path": "index.js",
      "size": 128,
      "lastModified": "2025-12-15T10:30:00.000Z"
    }
  ]
}
```

**cURL:**
```bash
curl http://localhost:3000/api/v2/projects/abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 7. Update Project
Update project details.

**Endpoint:** `PUT /api/v2/projects/:id`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Body:**
```json
{
  "name": "Updated Project Name",
  "description": "New description",
  "stack": "TypeScript",
  "language": "TypeScript"
}
```

**Response (200):**
```json
{
  "message": "Project updated successfully",
  "project": {
    "id": "abc123",
    "name": "Updated Project Name",
    "description": "New description",
    "stack": "TypeScript",
    "language": "TypeScript"
  }
}
```

**cURL:**
```bash
curl -X PUT http://localhost:3000/api/v2/projects/abc123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Updated Project Name",
    "description": "New description"
  }'
```

---

### 8. Delete Project
Delete a project and all its files from S3.

**Endpoint:** `DELETE /api/v2/projects/:id`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200):**
```json
{
  "message": "Project deleted successfully"
}
```

**cURL:**
```bash
curl -X DELETE http://localhost:3000/api/v2/projects/abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## File Management APIs

### 9. List Files
List all files in a project.

**Endpoint:** `GET /api/v2/projects/:id/files`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200):**
```json
{
  "files": [
    {
      "path": "README.md",
      "size": 256,
      "lastModified": "2025-12-15T10:30:00.000Z"
    },
    {
      "path": "src/index.js",
      "size": 512,
      "lastModified": "2025-12-15T10:35:00.000Z"
    },
    {
      "path": "package.json",
      "size": 384,
      "lastModified": "2025-12-15T10:32:00.000Z"
    }
  ]
}
```

**cURL:**
```bash
curl http://localhost:3000/api/v2/projects/abc123/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 10. Create or Update File
Create a new file or update existing file content.

**Endpoint:** `POST /api/v2/projects/:id/files`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Body:**
```json
{
  "path": "src/app.js",
  "content": "console.log('Hello World');",
  "contentType": "application/javascript"
}
```

**Note:** `contentType` is optional. Common types:
- `text/plain`
- `application/javascript`
- `application/json`
- `text/html`
- `text/css`
- `text/markdown`

**Response (200):**
```json
{
  "message": "File saved successfully"
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/v2/projects/abc123/files \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "path": "src/app.js",
    "content": "console.log(\"Hello World\");"
  }'
```

---

### 11. Get File Content
Download file content from S3.

**Endpoint:** `GET /api/v2/projects/:projectId/files/:path`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Note:** The `:path` should be URL encoded.

**Response (200):**
```json
{
  "path": "src/app.js",
  "content": "console.log('Hello World');"
}
```

**cURL:**
```bash
# For file: src/app.js
curl http://localhost:3000/api/v2/projects/abc123/files/src%2Fapp.js \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# For file: README.md
curl http://localhost:3000/api/v2/projects/abc123/files/README.md \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 12. Delete File
Delete a file from S3.

**Endpoint:** `DELETE /api/v2/projects/:projectId/files/:path`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200):**
```json
{
  "message": "File deleted successfully"
}
```

**cURL:**
```bash
# Delete src/app.js
curl -X DELETE http://localhost:3000/api/v2/projects/abc123/files/src%2Fapp.js \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Delete README.md
curl -X DELETE http://localhost:3000/api/v2/projects/abc123/files/README.md \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Complete Workflow Example

### Step 1: Register
```bash
curl -X POST http://localhost:3000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "secret123"
  }'
```

### Step 2: Login and Get Token
```bash
curl -X POST http://localhost:3000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "password": "secret123"
  }'
```

**Copy the token from response!**

### Step 3: Create a Project
```bash
TOKEN="your_jwt_token_here"

curl -X POST http://localhost:3000/api/v2/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Todo App",
    "description": "My first project",
    "stack": "React"
  }'
```

**Copy the project `id` from response!**

### Step 4: Create a File
```bash
PROJECT_ID="abc123"

curl -X POST http://localhost:3000/api/v2/projects/$PROJECT_ID/files \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "index.html",
    "content": "<!DOCTYPE html><html><body>Hello</body></html>"
  }'
```

### Step 5: List Files
```bash
curl http://localhost:3000/api/v2/projects/$PROJECT_ID/files \
  -H "Authorization: Bearer $TOKEN"
```

### Step 6: Get File Content
```bash
curl http://localhost:3000/api/v2/projects/$PROJECT_ID/files/index.html \
  -H "Authorization: Bearer $TOKEN"
```

### Step 7: Update File
```bash
curl -X POST http://localhost:3000/api/v2/projects/$PROJECT_ID/files \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "index.html",
    "content": "<!DOCTYPE html><html><body>Updated!</body></html>"
  }'
```

### Step 8: Delete File
```bash
curl -X DELETE http://localhost:3000/api/v2/projects/$PROJECT_ID/files/index.html \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "message": "Unauthorized"
}
```
**Cause:** Missing or invalid JWT token

### 400 Bad Request
```json
{
  "message": "Project name is required"
}
```
**Cause:** Missing required fields

### 403 Forbidden
```json
{
  "message": "Forbidden"
}
```
**Cause:** User doesn't own the project

### 404 Not Found
```json
{
  "message": "Project not found"
}
```
**Cause:** Project doesn't exist

### 500 Internal Server Error
```json
{
  "message": "Failed to create project"
}
```
**Cause:** Server error (check logs)

---

## Postman Collection Setup

### Environment Variables
Create a new environment with:
```
base_url: http://localhost:3000
token: (will be set after login)
project_id: (will be set after creating project)
```

### Pre-request Scripts
For authenticated endpoints, add:
```javascript
pm.request.headers.add({
    key: 'Authorization',
    value: 'Bearer ' + pm.environment.get('token')
});
```

### Test Scripts
After login, save token:
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set('token', response.token);
}
```

After creating project, save ID:
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set('project_id', response.project.id);
}
```

---

## WebSocket Events (For Reference)

These are handled by the WebSocket server on port 8080, not via REST API.

### Connection
```javascript
const socket = io('ws://localhost:8080', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});
```

### Events (Client → Server)
- `join-project` - Join project collaboration
- `leave-project` - Leave project
- `open-file` - Open file for editing
- `edit-document` - Send CRDT updates
- `cursor-update` - Share cursor position
- `terminal-command` - Execute command
- `subscribe-terminal` - Subscribe to terminal output

### Events (Server → Client)
- `file-opened` - File ready
- `document-update` - Document changed
- `user-joined` - User joined
- `user-left` - User left
- `cursor-update` - Cursor moved
- `terminal-output` - Command output

---

## Notes

- All authenticated APIs require JWT token in `Authorization: Bearer <token>` header
- File paths with `/` must be URL encoded (e.g., `src/app.js` → `src%2Fapp.js`)
- JWT tokens expire in 7 days
- Projects are automatically created with `README.md` and `index.js`
- All file operations sync with AWS S3 in real-time

Happy testing! 🚀
