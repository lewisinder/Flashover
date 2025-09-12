# Flashover Application

This is the repository for the Flashover web application, a tool for managing fire brigade appliances and reports. The project is built on Firebase and uses Firebase Hosting for the frontend and Cloud Functions for the backend logic.

## Current Architecture

The backend is composed of two main Google Cloud Functions located in `functions/index.js`.

### 1. The Main API (`api`)

This is an [Express.js](https://expressjs.com/) application that serves as the primary REST API for the frontend. It handles all core application logic, including:

-   User authentication and authorization.
-   Brigade management (creating, joining, managing members).
-   Appliance data management.
-   Creating and retrieving reports.
-   Image uploads for reports.

All API routes are prefixed with `/api` and require a valid Firebase authentication token.

### 2. The Email Sender (`processEmail`)

This is a background function triggered by Firestore events. It is responsible for sending all emails from the application using the [SendGrid](https://sendgrid.com/) service. This decouples the main API from the email-sending process, making the system more robust.

#### How the Email System Works

The `processEmail` function is designed to be simple and scalable. Here is the workflow:

1.  **Triggering an Email:** To send an email, any part of the application (for example, the main `api` function) must write a new document to the `mail` collection in Firestore.

2.  **Required Data Structure:** The document written to the `mail` collection **must** have the following structure:

    ```json
    {
      "to": "recipient@example.com",
      "message": {
        "subject": "This is the subject!",
        "html": "<p>This is the HTML content of the email.</p>"
      }
    }
    ```

3.  **Function Execution:** As soon as a new document is created in the `mail` collection, the `processEmail` function is automatically triggered.

4.  **Sending and Status Update:** The function reads the document, sends the email using the SendGrid API, and then updates the original document with a `status` field (`sent` on success or `error` on failure) for easy tracking and debugging.
