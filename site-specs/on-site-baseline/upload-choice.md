# Page: Choose how to add habitat data

## Page ID

upload-choice

## Route

/on-site-baseline/start

## Purpose

Allow the user to choose how they will provide habitat and boundary data so the correct journey branch can be followed.

---

## Page content

### Caption

- **Component:** GovUK Caption (large)
- **Text:** On-site baseline

### Heading

- **Component:** GovUK Heading (large)
- **Text:** How do you want to add your habitat data?

### Body text

- **Component:** GovUK Body
- **Text:**  
  You need to tell us about the site boundary and the habitat parcels within it.

---

## Form

### Question

- **Component:** GovUK Fieldset (legend size: medium)
- **Legend text:** What GIS files do you have?

### Input

- **Component:** GovUK Radios (large)
- **Field name:** uploadChoice
- **Required:** true

#### Options

1. **Value:** `single-file`  
   **Label:** I have one file with boundary and habitat parcels  
   **Hint:**  
   A single GIS file or project containing both your site boundary and habitat parcel layers.

2. **Value:** `separate-files`  
   **Label:** I have separate files for boundary and parcels  
   **Hint:**  
   Your red line boundary and habitat parcels are in different GIS files.

3. **Value:** `no-files`  
   **Label:** I don't have GIS files  
   **Hint:**  
   You can draw the boundary and habitat parcels on a map.

---

## Actions

### Primary action

- **Component:** GovUK Button
- **Text:** Continue
- **Action:** Submit form

---

## Data contract

On submit, store:

```json
{
  "uploadChoice": "single-file | separate-files | no-files"
}
```
