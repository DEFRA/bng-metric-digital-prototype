# Page: Upload habitat data (single file)

## Page ID

parcels-upload

## Route

/on-site-baseline/upload-single-file

## Purpose

Allow the user to upload a single GIS file that contains both the site boundary and habitat parcel geometries, which will then be inspected to identify layers and derive location information.

---

## Page content

### Caption

- **Component:** GovUK Caption (large)
- **Text:** On-site baseline

### Heading

- **Component:** GovUK Heading (large)
- **Text:** Upload your habitat data

### Body text

- **Component:** GovUK Body  
  **Text:**  
  Upload a GIS file containing your site boundary and habitat parcels.

- **Component:** GovUK Body  
  **Text:**  
  We'll identify the layers in your file and look up location information automatically.

---

## Supporting information

### Details (expandable help)

- **Component:** GovUK Details

**Summary text:**  
What layers should my file contain?

**Details content:**

- **GovUK Body:** Your file should include:
- **GovUK Bulleted list:**
  - A polygon for your site boundary (red line boundary)
  - Polygons for each habitat parcel within the site
- **GovUK Body:**  
  We'll ask you to confirm which layer is which after uploading.

---

## Form

### File upload

- **Component:** GovUK File Upload
- **Label (medium):** Upload a file
- **Field name:** fileUpload
- **Hint:** GeoPackage
- **Accepted formats:** `.gpkg`
- **Required:** true

---

## Actions

### Primary action

- **Component:** GovUK Button
- **Text:** Upload file
- **Action:** Submit form

---

## Data contract

On submit, store:

```json
{
  "uploadedFiles": {
    "habitatFile": {
      "originalName": "string",
      "mimeType": "string",
      "size": "number",
      "storageKey": "string"
    }
  }
}
```
