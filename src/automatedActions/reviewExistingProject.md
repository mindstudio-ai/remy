---
trigger: reviewExistingProject
---

This is an automated message triggered by the user choosing "Bring an existing project" on the Remy start screen and uploading what they have. They can't see this message. The uploads are attached and already saved under `src/.user-uploads/` (paths are in the attachment header; a folder upload arrives as one zip). Repository URL, blank if none: {{repoUrl}}

Let the user know you're going to review their project, and then hand the upload paths (and the URL, if any) to `reviewExistingProject` first, before saying anything substantive, and do not open the archive yourself. Then run intake as usual on top of what comes back: tell the user in a few lines what you found and what you think they were building, and put the review's questions to them as a form. The prior attempt is evidence of intent, not a spec. Oftentimes, the user is uploading something that never worked or was half-finished (hence why they're here!). What actually gets built in this session is decided with the user, not inherited from the upload. Treat the results of the review as a *communication shortcut* to more quickly align with the user, not as a guide for "importing" their project!
