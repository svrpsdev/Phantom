// ============================================================
// 📊 GRAPH API CLIENT — Standalone
// ============================================================

const axios = require('axios');

class GraphClient {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
    }

    // ── ✅ GET REQUEST ──
    async get(endpoint) {
        try {
            const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Graph GET error:', error.response?.data || error.message);
            throw error;
        }
    }

    // ── ✅ POST REQUEST ──
    async post(endpoint, data) {
        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Graph POST error:', error.response?.data || error.message);
            throw error;
        }
    }

    // ── ✅ PATCH REQUEST ──
    async patch(endpoint, data) {
        try {
            const response = await axios.patch(`${this.baseUrl}${endpoint}`, data, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Graph PATCH error:', error.response?.data || error.message);
            throw error;
        }
    }

    // ── ✅ DELETE REQUEST ──
    async delete(endpoint) {
        try {
            const response = await axios.delete(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Graph DELETE error:', error.response?.data || error.message);
            throw error;
        }
    }

    // ── ✅ USER PROFILE ──
    async getUserProfile() {
        return this.get('/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones');
    }

    // ── ✅ INBOX ──
    async getInbox(limit = 50) {
        return this.get(`/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`);
    }

    // ── ✅ SENT ITEMS ──
    async getSentItems(limit = 50) {
        return this.get(`/me/mailFolders/sentitems/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`);
    }

    // ── ✅ CONTACTS ──
    async getContacts() {
        return this.get('/me/contacts?$top=100&$select=displayName,emailAddresses,mobilePhone,businessPhones,jobTitle,department');
    }

    // ── ✅ CALENDAR EVENTS ──
    async getEvents(limit = 25) {
        return this.get(`/me/events?$top=${limit}&$orderby=start/dateTime desc&$select=subject,start,end,location,attendees,organizer,bodyPreview`);
    }

    // ── ✅ MANAGER ──
    async getManager() {
        return this.get('/me/manager');
    }

    // ── ✅ DIRECT REPORTS ──
    async getDirectReports() {
        return this.get('/me/directReports');
    }

    // ── ✅ ORGANIZATION ──
    async getOrganization() {
        return this.get('/organization');
    }

    // ── ✅ MAIL FOLDERS ──
    async getMailFolders() {
        return this.get('/me/mailFolders');
    }

    // ── ✅ GET EMAIL BY ID ──
    async getEmail(messageId) {
        return this.get(`/messages/${messageId}?$select=id,subject,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,isRead,hasAttachments,importance,conversationId`);
    }

    // ── ✅ SEARCH EMAILS ──
    async searchEmails(query, folderId = 'inbox', limit = 50) {
        const endpoint = folderId === 'inbox' 
            ? `/mailFolders/inbox/messages?$search="${encodeURIComponent(query)}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`
            : `/mailFolders/${folderId}/messages?$search="${encodeURIComponent(query)}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`;
        return this.get(endpoint);
    }

    // ── ✅ SEND EMAIL ──
    async sendEmail(to, subject, body, replyToId = null, forwardFromId = null) {
        const emailData = {
            message: {
                subject: subject,
                body: { content: body, contentType: 'HTML' },
                toRecipients: to.map(email => ({ emailAddress: { address: email } }))
            }
        };
        if (replyToId) emailData.message.conversationId = replyToId;
        if (forwardFromId) emailData.message.forwardFrom = { id: forwardFromId };
        return this.post('/me/sendMail', emailData);
    }

    // ── ✅ VALIDATE TOKEN ──
    async validateToken() {
        try {
            await this.get('/me?$select=id');
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = GraphClient;
