# 05. Frontend Specification

## 1. Frontend delivery mode
The frontend may be developed separately by another person. This is fully acceptable and recommended.

Two workable modes:
1. Static HTML/CSS/JS pages first, then connect APIs
2. Prototype/UI design first, then implement pages

## 2. Frontend tech suggestion for V1
- HTML
- CSS
- JavaScript
- Bootstrap

Keep it simple. Avoid adding heavy frontend frameworks unless the frontend developer strongly prefers them.

## 3. Page list

## 3.1 Login page
### Elements
- username input
- password input
- login button
- error message area

### Behavior
- submit on Enter
- display invalid credential errors
- redirect by role after login

## 3.2 Tool list page
### Elements
- keyword search
- status filter
- category filter
- table/list of tools
- borrow button for tools in `IN_STOCK`

### Columns
- tool code
- tool name
- category
- current status
- action

## 3.3 Borrow page
### Elements
- selected tool info
- remark textarea
- image upload area
- image preview
- submit button

### Behavior
- optional client-side compression before upload
- must block submit if no photo selected
- show upload progress or loading state

## 3.4 My borrow records page
### Elements
- list of borrow orders
- order number
- borrow time
- tool summary
- current return/review state
- return entry button

## 3.5 Return page
### Elements
- borrow order basic info
- borrowed tool list
- return photo upload
- abnormal note input
- submit button

### Behavior
- show at least one borrowed image if available
- allow user to describe issues
- do not let user set final status; admin does that

## 3.6 Admin dashboard
### Cards
- borrowed count
- pending return review count
- count by tool status

## 3.7 Tool management page
### Functions
- create tool
- edit tool
- delete tool
- search/filter tool list
- manual status update if authorized

## 3.8 Return review page
This is the most important admin page.

### Must show
- return order info
- user info
- borrow photos
- return photos
- issue description
- tool list
- final status selector per tool
- approve/reject button

### Recommended layout
- left: borrow photos
- right: return photos
- bottom: item review table

## 3.9 User management page
### Functions
- create user
- activate/deactivate user
- create admin
- grant/revoke admin permissions

## 3.10 Audit log page
### Functions
- filter logs
- display actor, action, time, target
- simple detail expansion

## 4. UI rules
- Use fixed badge colors for statuses
- Make photo preview clear and large enough for manual checking
- Keep forms short and direct
- Prioritize mobile-friendly borrow/return pages
- Prioritize desktop-friendly admin review pages

## 5. Frontend-backend contract checklist
Before implementation, frontend and backend must agree on:
- auth model
- exact API paths
- enum values
- upload field names
- response structure
- pagination format
- timestamp format

## 6. Suggested status labels
Backend enum -> Chinese label
- `IN_STOCK` -> 在库
- `BORROWED` -> 借出
- `DAMAGED` -> 损坏
- `PARTIALLY_LOST` -> 部分丢失
- `LOST` -> 丢失
- `SCRAPPED` -> 报废

## 7. Suggested deliverables from frontend designer/developer
- page wireframes or mockups
- shared style tokens (colors, spacing, status badges)
- static pages or prototype links
- asset list
- API integration checklist