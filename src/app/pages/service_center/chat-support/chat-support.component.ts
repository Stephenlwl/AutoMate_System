import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceCenterChatService, ChannelData, ChatUser } from '../service-center-chat.service';
import { Channel } from 'stream-chat';
import { Subscription } from 'rxjs';
import { Firestore, collection, addDoc, updateDoc, deleteDoc, doc, collectionData, query, where } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-service-center-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-support.component.html',
  styleUrls: ['./chat-support.component.css']
})
export class ServiceCenterChatComponent implements OnInit, OnDestroy {
  serviceCenterId: string = '';
  serviceCenterName: string = '';
  channels: ChannelData[] = [];
  filteredChannels: ChannelData[] = [];
  selectedChannel: Channel | null = null;
  selectedChannelData: ChannelData | null = null;
  messages: any[] = [];
  newMessage = '';
  selectedFilter = 'all';
  isTyping: string | boolean = false;
  showQuickResponses = true;
  showDeleteConfirm = false;
  channelToDelete: string | null = null;
  isDeleting = false;
  currentUser: ChatUser | null = null;
  selectedImage: string | null = null;
  showImageModal = false;

  newChatServiceRequestId = '';
  quickResponses: any[] = [];
  private subscriptions: Subscription[] = [];
  private auth = inject(AuthService);

  constructor(private chatService: ServiceCenterChatService, private firestore: Firestore, private authService: AuthService) { }

  async ngOnInit() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    this.serviceCenterName = this.auth.getServiceCenterName();
    this.loadChannels();
    this.loadQuickResponses();
  }

  async loadChannels() {
    const initialized = await this.chatService.initializeServiceCenter();

    if (initialized) {
      // subscribe to current user
      this.subscriptions.push(
        this.chatService.currentUser$.subscribe(user => {
          this.currentUser = user;
        })
      );

      // subscribe to channels
      this.subscriptions.push(
        this.chatService.channels$.subscribe(channels => {
          this.channels = channels;
          this.filterChannels(this.selectedFilter);
        })
      );

      // subscribe to selected channel
      this.subscriptions.push(
        this.chatService.selectedChannel$.subscribe(channel => {
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
      console.error('Failed to initialize service center chat service');
    }
  }

  loadQuickResponses() {
    if (!this.serviceCenterId) return;

    const quickResponsesRef = collection(this.firestore, 'quick_responses');
    const q = query(quickResponsesRef, where('uploadedUserId', '==', this.serviceCenterId));

    collectionData(q, { idField: 'id' }).subscribe(responses => {
      this.quickResponses = responses;
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.chatService.disconnect();
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
    await this.chatService.selectChannel(channelId);
  }

  private loadMessages() {
    if (!this.selectedChannel) return;

    this.selectedChannel.query({
      messages: { limit: 50 }
    }).then(() => {
      this.messages = [...(this.selectedChannel?.state.messages || []) as any];
      this.processMessageAttachments(this.messages);
    });
  }

  private processMessageAttachments(messages: any[]) {
    messages.forEach(message => {
      if (message.attachments && message.attachments.length > 0) {
        message.attachments.forEach((attachment: any) => {
          if (attachment.asset_url && !attachment.asset_url.startsWith('http')) {
            attachment.asset_url = this.getFullAttachmentUrl(attachment.asset_url);
          }
          if (!attachment.type) {
            attachment.type = this.detectAttachmentType(attachment);
          }
        });
      }
    });
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

    // Listen for new messages
    this.selectedChannel.on('message.new', (event: any) => {
      if (event.message) {
        this.messages.push(event.message);
        this.processMessageAttachments([event.message]);
      }
    });

    // Listen for typing indicators
    this.selectedChannel.on('typing.start', (event: any) => {
      if (event.user?.id !== this.currentUser?.id) {
        this.isTyping = event.user?.id === 'admin-support' ? 'admin-support' : 'customer';
      }
    });

    this.selectedChannel.on('typing.stop', (event: any) => {
      if (event.user?.id !== this.currentUser?.id) {
        this.isTyping = false;
      }
    });
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!this.selectedChannel) return;

    try {
      const { file: uploadedUrl } = await this.selectedChannel.sendFile(file, file.name);

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
      addDoc(quickResponsesRef, {
        uploadedUserId: this.serviceCenterId,
        text,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: this.serviceCenterName
      });
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

  closeChat() {
    this.selectedChannel = null;
    this.selectedChannelData = null;
    this.messages = [];
    this.chatService.selectChannel(null as any);
  }

  // start chat with admin
  async startAdminChat() {
    try {
      const channel = await this.chatService.startAdminChat();

      const channelId = channel.id;
      if (!channelId) {
        console.error('Cannot select channel: Channel ID is undefined');
        return;
      }

      await this.selectChannel(channelId);
    } catch (error) {
      console.error('Error starting admin chat:', error);
    }
  }

  // Send message
  async sendMessage() {
    if (!this.newMessage?.trim() || !this.selectedChannel) return;

    try {
      const channelId = this.selectedChannel.id;
      if (!channelId) {
        console.error('Cannot send message: Channel ID is undefined');
        return;
      }

      await this.chatService.sendMessage(channelId, this.newMessage);
      this.newMessage = '';
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  confirmDeleteChannel(channelId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.channelToDelete = channelId;
    this.showDeleteConfirm = true;
    this.deleteChannel();
  }

  async deleteChannel() {
    if (!this.channelToDelete) return;

    this.isDeleting = true;
    try {
      const success = await this.chatService.deleteChannel(this.channelToDelete);

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

  getChannelAvatar(channel: ChannelData): string {
    if (channel.host_by === 'user' && channel.customer_info?.avatar) {
      return channel.customer_info.avatar;
    } else if (channel.host_by === 'admin_support') {
      return this.generateDefaultAvatar('Admin Support', 'admin');
    } else if (channel.host_by === 'service_center' && channel.center_info?.avatar) {
      return channel.center_info.avatar;
    }

    return this.generateDefaultAvatar(channel.name || this.getChannelTypeLabel(channel.host_by), channel.host_by);
  }

  private generateDefaultAvatar(name: string, type: string = 'default'): string {
    const colors = {
      'admin': '4A90E2',
      'service_center': 'FF6B00',
      'user': '8E44AD',
      'default': '6C757D'
    };

    const color = colors[type as keyof typeof colors] || colors.default;
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=${color}&color=fff&size=128&bold=true&length=1`;
  }

  handleAvatarError(event: Event, channel: ChannelData) {
    const img = event.target as HTMLImageElement;
    img.src = this.generateDefaultAvatar(channel.name || this.getChannelTypeLabel(channel.host_by), channel.host_by);
  }

  getChannelIcon(type: string): string {
    switch (type) {
      case 'admin_support': return 'bi bi-headset';
      case 'user': return 'bi bi-person';
      case 'service_center': return 'bi bi-building';
      default: return 'bi bi-chat';
    }
  }

  getChannelTypeLabel(type: string): string {
    switch (type) {
      case 'admin_support': return 'Admin Support';
      case 'user': return 'Customer';
      case 'service_center': return 'Service Center';
      default: return 'Chat';
    }
  }

  getChannelAvatarClass(type: string): string {
    switch (type) {
      case 'admin_support': return 'bg-support text-white';
      case 'user': return 'bg-user text-white';
      case 'service_center': return 'bg-service text-white';
      default: return 'bg-default text-white';
    }
  }

  getChannelBadgeClass(type: string): string {
    switch (type) {
      case 'admin_support': return 'badge-support';
      case 'user': return 'badge-service';
      case 'service_center': return 'badge-primary';
      default: return 'badge-default';
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
}