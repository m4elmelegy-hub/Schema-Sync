# [HALAL TECH ERP — Fix PIN + Super Admin Redesign]

You are working on the Halal Tech ERP system. There are 3 issues to fix:

---

## Issue 1: PIN accepts any characters (not just 6 digits)

### Problem
The login page only allows exactly 6 numeric digits for PIN entry.
But the database and registration forms allow longer PINs with letters and symbols.
This causes users with complex PINs to be unable to login.

### Fix Required

**In the login page (`artifacts/erp-system/src/pages/login.tsx` or similar):**
- Remove any `maxLength={6}` restriction on PIN input
- Remove any numeric-only validation on PIN
- Allow PIN to be any length (minimum 4 characters) with any characters (letters, numbers, symbols)
- The PIN input should still be type="password" (hidden characters)
- Remove any input mask or OTP-style boxes that limit to 6 digits
- Replace with a standard password input field that accepts any characters

**In ALL user creation/edit forms:**
- PIN field should accept minimum 4 characters, any type
- Remove any `maxLength` or numeric-only restrictions
- Update validation messages to say: "الرقم السري يجب أن يكون 4 أحرف على الأقل"

**In the backend auth route (`artifacts/api-server/src/routes/auth.ts`):**
- Remove any PIN length or format validation
- Just compare the entered PIN with stored PIN directly
- If PINs are hashed with bcrypt, use bcrypt.compare()

---

## Issue 2: Super Admin Dashboard — Redesign to match app theme

### Current Problem
The Super Admin page (`artifacts/erp-system/src/pages/super-admin.tsx`) uses a light/default theme that doesn't match the rest of the app which uses dark theme with orange (#F97316) and dark navy/black (#0F172A, #1E293B) colors.

### Fix Required

Redesign the entire Super Admin page to match the existing app design system:

**Colors to use (from existing app):**
- Primary background: `#0F172A` (dark navy)
- Card background: `#1E293B`
- Border color: `#334155`
- Primary accent: `#F97316` (orange)
- Text primary: `#F8FAFC`
- Text secondary: `#94A3B8`
- Success: `#22C55E`
- Danger: `#EF4444`
- Warning: `#F59E0B`

**Typography:**
- Use the same fonts as the rest of the app: `Tajawal` and `Cairo` (Arabic fonts)
- All text must be RTL Arabic

**Layout redesign:**

1. **Header/Title bar:**
   - Dark background with orange accent line at bottom
   - Title: "لوحة تحكم المدير العام" in large bold Arabic text
   - Subtitle with current date

2. **Stats cards (6 cards):**
   - Dark card background (#1E293B)
   - Orange icon color
   - Animated number counters
   - Cards: إجمالي الشركات / نشطة / تجريبية / موقوفة / منتهية / المستخدمون
   - Hover effect with orange border glow

3. **Companies table:**
   - Dark table with alternating row colors (#1E293B and #0F172A)
   - Orange header row with white text
   - Status badges with appropriate colors (نشط=green, تجريبي=orange, موقوف=red)
   - Action buttons styled like the rest of the app

4. **Create Company form:**
   - Inline form with dark inputs
   - Orange "إنشاء الشركة" button matching app style
   - Input fields with dark background and orange focus ring

5. **Action buttons:**
   - "إيقاف الشركة": red outlined button
   - "تمديد": orange outlined button  
   - "ترقية إلى Paid": filled orange button
   - All buttons should have the same border-radius and padding as existing app buttons

6. **Expandable company rows:**
   - Show users list when expanded
   - Dark sub-table matching main table style
   - Orange expand arrow icon

**Important:** 
- Keep ALL existing functionality exactly as is
- Only change the visual styling
- Maintain RTL layout
- All Arabic text must use Tajawal font
- Add smooth transitions and hover effects matching the app

---

## Issue 3: Consistent fonts across Super Admin page

Make sure the Super Admin page imports and uses the same font stack as the rest of the app:
```css
font-family: 'Tajawal', 'Cairo', sans-serif;
```

Check that the page has `dir="rtl"` and proper Arabic text alignment.

---

## Delivery Order
1. Fix PIN input on login page first (most critical)
2. Fix PIN validation in all user forms
3. Fix backend PIN validation
4. Redesign Super Admin page colors and fonts
5. Test that login works with complex PIN (letters + numbers + symbols)

## Testing Checklist
- [ ] Can login with PIN containing letters, numbers, symbols
- [ ] Can login with PIN longer than 6 characters
- [ ] User creation form accepts complex PIN
- [ ] Super Admin page matches dark orange theme
- [ ] All Arabic text uses Tajawal font
- [ ] RTL layout is correct
