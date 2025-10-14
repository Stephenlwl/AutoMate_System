import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminChatService } from '../admin-chat.service';
import { Channel } from 'stream-chat';
import { Subscription } from 'rxjs';
import { Firestore, collection, addDoc, updateDoc, deleteDoc, doc, collectionData, query, where, getDocs, DocumentData } from '@angular/fire/firestore';
import { AdminService } from '../auth/system-admin-auth';

interface ServiceCenter {
  id: string;
  name: string;
  isOnline: boolean;
  responseTime: string;
  serviceCenterPhoto?: string;
}

export interface ChannelData {
  id: string;
  type: string;
  name: string;
  member_count: number;
  last_message_at: string;
  host_by: string;
  custom_type?: string;
  customer_info?: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  center_info?: {
    id: string;
    name: string;
    avatar?: string;
  };
  service_type?: string;
  emergency_info?: {
    issue: string;
    reported_at: string;
  };
  unread_count?: number;
  image?: string;
  
  // Add the missing properties
  service_center_id?: string;
  member_avatar?: string;
  extraData?: {
    [key: string]: any;
    image?: string;
  };
  last_message?: string;
}

@Component({
  selector: 'app-manage-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-chat.component.html',
  styleUrls: ['./manage-chat.component.css']
})
export class ManageChatComponent implements OnInit, OnDestroy {
  channels: ChannelData[] = [];
  filteredChannels: ChannelData[] = [];
  selectedChannel: Channel | null = null;
  selectedChannelData: ChannelData | null = null;
  messages: any[] = [];
  systemAdminId: string | null = null;
  systemAdminName: string | null = null;
  newMessage = '';
  selectedFilter = 'all';
  isTyping = false;
  showQuickResponses = true;
  showDeleteConfirm = false;
  channelToDelete: string | null = null;
  isDeleting = false;
  selectedImage: string | null = null;
  showImageModal = false;
  private subscriptions: Subscription[] = [];

  quickResponses: any[] = [];
  private serviceCenters: Map<string, ServiceCenter> = new Map();

  constructor(private adminChatService: AdminChatService, private firestore: Firestore, private adminService: AdminService) { }

  async ngOnInit() {
    this.systemAdminId = this.adminService.getAdminId();
    this.systemAdminName = this.adminService.getAdminName();
    await this.loadServiceCenters(); // Load service centers first
    this.loadChannels();
    this.loadQuickResponses();
  }

  async loadChannels() {
    const initialized = await this.adminChatService.initialize();

    if (initialized) {
      await this.adminChatService.loadChannels();

      // subscribe to channels
      this.subscriptions.push(
        this.adminChatService.channels$.subscribe(channels => {
          this.channels = channels;
          this.filterChannels(this.selectedFilter);
        })
      );

      // subscribe to selected channel
      this.subscriptions.push(
        this.adminChatService.selectedChannel$.subscribe(channel => {
          this.selectedChannel = channel;
          if (channel) {
            this.selectedChannelData = this.channels.find(c => c.id === channel.id) || null;
            this.loadMessages();
            this.setupChannelListeners();
          } else {
            this.selectedChannelData = null;
            this.messages = [];
          }
        })
      );
    } else {
      console.error('Failed to initialize admin chat service');
    }
  }

  loadQuickResponses() {
    if (!this.systemAdminId) return;

    const quickResponsesRef = collection(this.firestore, 'quick_responses');
    const q = query(quickResponsesRef, where('uploadedUserId', '==', this.systemAdminId));

    collectionData(q, { idField: 'id' }).subscribe(responses => {
      this.quickResponses = responses;
    });
  }

  private async loadServiceCenters() {
    try {
      const serviceCentersRef = collection(this.firestore, 'service_centers');
      const q = query(serviceCentersRef, where('verification.status', '==', 'approved'));
      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        try {
          const data = doc.data();

          const serviceCenter: ServiceCenter = {
            id: doc.id,
            name: data['serviceCenterName']?.toString() || 'Service Center',
            isOnline: data['isOnline'] || false,
            responseTime: data['responseTime']?.toString() || 'Within 24 hours',
            serviceCenterPhoto: data['serviceCenterPhoto']?.toString() || '',
          };

          this.serviceCenters.set(doc.id, serviceCenter);
        } catch (error) {
          console.error(`Error processing service center ${doc.id}:`, error);
          // Create basic service center with available data (fallback)
          const data = doc.data();
          const fallbackServiceCenter: ServiceCenter = {
            id: doc.id,
            name: data['serviceCenterName']?.toString() || 'Service Center',
            isOnline: false,
            responseTime: data['responseTime']?.toString() || 'Within 24 hours',
            serviceCenterPhoto: data['serviceCenterPhoto']?.toString() || '',
          };
          this.serviceCenters.set(doc.id, fallbackServiceCenter);
        }
      }
      console.log(`Loaded ${this.serviceCenters.size} service centers`);
    } catch (error) {
      console.error('Error loading service centers:', error);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.adminChatService.disconnect();
  }

  get totalChannels(): number {
    return this.channels.length;
  }

  filterChannels(type: string) {
    this.selectedFilter = type;

    if (type === 'all') {
      this.filteredChannels = [...this.channels];
    } else {
      this.filteredChannels = this.channels.filter(c => c.host_by === type);
    }

    // sort by last message
    this.filteredChannels.sort((a, b) => {
      const aTime = new Date(a.last_message_at || 0).getTime();
      const bTime = new Date(b.last_message_at || 0).getTime();
      return bTime - aTime;
    });
  }

  async selectChannel(channelId: string) {
    await this.adminChatService.selectChannel(channelId);
  }

  private loadMessages() {
    if (!this.selectedChannel) return;

    this.selectedChannel.query({
      messages: { limit: 50 }
    }).then(() => {
      this.messages = [...(this.selectedChannel?.state.messages || []) as any];

      // Process attachments for all loaded messages
      this.messages.forEach(message => this.processMessageAttachments(message));
    });
  }

  private processMessageAttachments(message: any) {
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach((attachment: any) => {
        // Ensure attachment has proper url
        if (attachment.asset_url && !attachment.asset_url.startsWith('http')) {
          // Handle relative url if needed
          attachment.asset_url = this.getFullAttachmentUrl(attachment.asset_url);
        }

        // Detect attachment type if not provided
        if (!attachment.type) {
          attachment.type = this.detectAttachmentType(attachment);
        }
      });
    }
  }

  isImageAttachment(attachment: any): boolean {
    if (attachment.type === 'image') return true;

    const url = attachment.asset_url || attachment.image_url || attachment.thumb_url;
    if (!url) return false;

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const isImageUrl = imageExtensions.some(ext =>
      url.toLowerCase().includes(ext)
    );

    return isImageUrl || attachment.mime_type?.startsWith('image/');
  }

  getAttachmentUrl(attachment: any): string {
    return attachment.asset_url || attachment.image_url || attachment.thumb_url || '';
  }

  private getFullAttachmentUrl(url: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    return url;
  }

  private detectAttachmentType(attachment: any): string {
    const url = this.getAttachmentUrl(attachment);

    if (this.isImageAttachment(attachment)) {
      return 'image';
    }

    return 'file';
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  openImageModal(attachment: any) {
    this.selectedImage = this.getAttachmentUrl(attachment);
    this.showImageModal = true;
  }

  closeImageModal() {
    this.selectedImage = null;
    this.showImageModal = false;
  }

  private setupChannelListeners() {
    if (!this.selectedChannel) return;

    this.selectedChannel.on('message.new', (event: any) => {
      if (event.message) {
        this.messages.push(event.message);
        this.processMessageAttachments(event.message);
      }
    });

    this.selectedChannel.on('typing.start', (event: any) => {
      if (event.user?.id !== 'admin-support') {
        this.isTyping = true;
      }
    });

    this.selectedChannel.on('typing.stop', (event: any) => {
      if (event.user?.id !== 'admin-support') {
        this.isTyping = false;
      }
    });
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!this.selectedChannel) return;

    try {
      // upload the file
      const { file: uploadedUrl } = await this.selectedChannel.sendFile(file, file.name);

      // Send a message with the uploaded file as an attachment
      await this.selectedChannel.sendMessage({
        text: `File uploaded: ${file.name}`,
        attachments: [
          {
            type: file.type.startsWith('image/') ? 'image' : 'file',
            asset_url: uploadedUrl,
            title: file.name
          }
        ]
      });

      console.log('File uploaded and message sent successfully');
    } catch (error) {
      console.error('Error uploading file to Stream:', error);
    }
  }

  useQuickResponse(response: string) {
    this.newMessage = response;
  }

  addQuickResponse() {
    const text = prompt('Enter a new quick response:');
    if (text) {
      const quickResponsesRef = collection(this.firestore, 'quick_responses');
      addDoc(quickResponsesRef, { uploadedUserId: this.systemAdminId, text, createdAt: new Date(), updatedAt: new Date(), createdBy: this.systemAdminName });
    }
  }

  editQuickResponse(response: any) {
    const newText = prompt('Edit quick response:', response.text);
    if (newText !== null && newText.trim() !== '') {
      const docRef = doc(this.firestore, 'quick_responses', response.id);
      updateDoc(docRef, { text: newText });
    }
  }

  deleteQuickResponse(id: string) {
    if (confirm('Are you sure you want to delete this quick response?')) {
      const docRef = doc(this.firestore, 'quick_responses', id);
      deleteDoc(docRef);
    }
  }

  async sendMessage() {
    if (!this.newMessage?.trim() || !this.selectedChannel) return;

    try {
      if (this.selectedChannel?.id) {
        await this.adminChatService.sendMessage(this.selectedChannel.id, this.newMessage);
      } else {
        console.error('Selected channel ID is undefined');
      }
      this.newMessage = '';
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  confirmDeleteChannel(channelId: string, event?: Event) {
    if (event) {
      event.stopPropagation(); // for preventing channel selection
    }
    this.channelToDelete = channelId;
    this.showDeleteConfirm = true;
    this.deleteChannel();
  }

  async deleteChannel() {
    if (!this.channelToDelete) return;

    this.isDeleting = true;
    try {
      const success = await this.adminChatService.deleteChannel(this.channelToDelete);

      if (success) {
        console.log('Channel deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
    } finally {
      this.isDeleting = false;
      this.showDeleteConfirm = false;
      this.channelToDelete = null;
    }
  }

  closeChat() {
    this.selectedChannel = null;
    this.selectedChannelData = null;
    this.messages = [];
    // use the public observable instead of directly accessing the subject
    this.adminChatService.selectedChannelSubject.next(null);
  }

  
  getChannelIcon(type: string): string {
    switch (type) {
      case 'service_center': return 'bi bi-building';
      case 'user': return 'bi bi-person';
      default: return 'bi bi-chat';
    }
  }

  getChannelTypeLabel(type: string): string {
    switch (type) {
      case 'service_center': return 'Service Center';
      case 'user': return 'Customer';
      default: return 'Chat';
    }
  }

  formatTime(dateString: string): string {
    if (!dateString) return 'No messages';

    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  }

  formatMessageTime(dateString: string | Date | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getChannelAvatarClass(type: string): string {
    switch (type) {
      case 'service_center': return 'bg-support text-white';
      case 'user': return 'bg-user text-white';
      default: return 'bg-default text-white';
    }
  }

  getChannelBadgeClass(type: string): string {
    switch (type) {
      case 'service_center': return 'badge-support';
      case 'user': return 'badge-service';
      default: return 'badge-default';
    }
  }
}