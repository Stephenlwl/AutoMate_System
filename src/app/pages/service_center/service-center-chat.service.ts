import { Injectable, inject } from '@angular/core';
import { StreamChat, Channel, UserResponse, MessageResponse } from 'stream-chat';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth/service-center-auth';

interface CustomUserResponse extends UserResponse {
  center_id?: string;
  [key: string]: any;
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
  };
  center_info?: {
    id: string;
    name: string;
  };
  service_type?: string;
  emergency_info?: {
    issue: string;
    reported_at: string;
  };
  unread_count?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceCenterChatService {
  private client: StreamChat | null = null;
  private baseUrl = 'http://localhost:3000';
  private channelsSubject = new BehaviorSubject<ChannelData[]>([]);
  private selectedChannelSubject = new BehaviorSubject<Channel | null>(null);
  private currentUserSubject = new BehaviorSubject<ChatUser | null>(null);

  private authService = inject(AuthService);

  public channels$ = this.channelsSubject.asObservable();
  public selectedChannel$ = this.selectedChannelSubject.asObservable();
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) { }

  adminData = this.authService.getAdmin();
  centerId = this.adminData.id;
  serviceCenterId = this.centerId;
  serviceCenterName = this.adminData.serviceCenterName || 'Service Center';

  // initialize for service center
  async initializeServiceCenter(): Promise<boolean> {
    try {

      const tokenResponse = await this.http.post<any>(
        `${this.baseUrl}/service-center/token`,
        {
          userId: this.serviceCenterId,
          name: this.serviceCenterName,
          role: 'service_center',
          centerId: this.centerId
        }
      ).pipe(
        catchError(this.handleError.bind(this))
      ).toPromise();

      if (!tokenResponse || !tokenResponse.token) {
        throw new Error('Invalid token response from server');
      }

      console.log('Token received, initializing Stream client...');

      this.client = StreamChat.getInstance('3mj9hufw92nk');

      const user: CustomUserResponse = {
        id: this.serviceCenterId,
        name: this.serviceCenterName,
        custom_type: 'service_center',
        role: 'service_center',
        image: 'https://i.imgur.com/fR9Jz14.png',
        center_id: this.centerId
      } as CustomUserResponse;

      await this.client.connectUser(user, tokenResponse.token);

      this.currentUserSubject.next({
        id: this.serviceCenterId,
        name: this.serviceCenterName,
        role: 'service_center'
      });

      console.log('User connected to Stream Chat');

      this.startChannelListener();
      await this.loadChannels();
      return true;
    } catch (error) {
      console.error('Service center chat initialization error:', error);
      return false;
    }
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      errorMessage = `Server returned code ${error.status}, error: ${error.message}`;

      if (error.error && error.error.error) {
        errorMessage += ` - ${error.error.error}`;
      }
    }

    console.error('HTTP Error:', errorMessage);
    return throwError(errorMessage);
  }

  // Load channels for service center
  async loadChannels(type?: string): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Stream Chat client not initialized');
      }

      const currentUser = this.currentUserSubject.value;
      if (!currentUser) {
        throw new Error('Current user not available');
      }

      const filter: any = {
        type: 'messaging',
        members: { $in: [currentUser.id] }
      };

      if (type && type !== 'all') {
        filter.type = type;
      }

      const sort = [{ last_message_at: -1 }];
      const channels = await this.client.queryChannels(filter, sort, {
        watch: true,
        state: true,
      });

      const channelData: ChannelData[] = channels.map(channel => {
        const data = channel.data as any;

        return {
          id: channel.id || '',
          host_by: data?.host_by || 'user',
          type: data?.type || 'general',
          name: data?.service_center_info?.name || data?.customer_info?.name || 'Unknown',
          member_count: data?.member_count || 0,
          last_message_at: data?.last_message_at || new Date().toISOString(),
          customer_info: data?.customer_info,
          service_request: data?.service_request,
          unread_count: channel.countUnread(),
        };
      });

      this.channelsSubject.next(channelData);
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  }

  async startAdminChat(): Promise<Channel> {
    try {
      if (!this.client) {
        throw new Error('Stream Chat client not initialized');
      }

      const currentUser = this.currentUserSubject.value;
      if (!currentUser) {
        throw new Error('Current user not available');
      }

      const channelId = `admin_support_${currentUser.id}`;

      const channelData: any = {
        name: 'Admin Support',
        members: [currentUser.id, 'admin-support'],
        host_by: 'service_center',
        created_by_id: currentUser.id,
        service_center_info: {
          userId: this.serviceCenterId,
          name: this.serviceCenterName,
        }
      };

      const channel = this.client.channel('messaging', channelId, channelData);
      await channel.create();
      await this.loadChannels();
      return channel;
    } catch (error) {
      console.error('Error starting admin chat:', error);
      throw error;
    }
  }

  async startCustomerChat(customerId: string, customerName: string, serviceRequestId?: string): Promise<Channel> {
    try {
      if (!this.client) {
        throw new Error('Stream Chat client not initialized');
      }

      const currentUser = this.currentUserSubject.value;
      if (!currentUser) {
        throw new Error('Current user not available');
      }

      const channelId = `service_${currentUser.id}_${customerId}`;

      const channelData: any = {
        name: customerName, 
        type: 'service',
        members: [currentUser.id, customerId],
        created_by_id: currentUser.id,
        customer_info: {
          id: customerId,
          name: customerName
        }
      };

      if (serviceRequestId) {
        channelData.service_request = { id: serviceRequestId };
      }

      const channel = this.client.channel('messaging', channelId, channelData);
      await channel.create();
      await this.loadChannels();
      return channel;
    } catch (error) {
      console.error('Error starting customer chat:', error);
      throw error;
    }
  }

  async selectChannel(channelId: string): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Stream Chat client not initialized');
      }

      const filter = { id: { $eq: channelId } };
      const channels = await this.client.queryChannels(filter, {}, {
        watch: true,
        state: true
      });

      if (channels.length > 0) {
        this.selectedChannelSubject.next(channels[0]);
        await channels[0].markRead();
        this.loadChannels();
      }
    } catch (error) {
      console.error('Error selecting channel:', error);
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Stream Chat client not initialized');
      }

      const channel = this.client.channel('messaging', channelId);
      await channel.sendMessage({ text });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  private startChannelListener(): void {
    if (!this.client) return;

    this.client.on('message.new', (event) => {
      this.loadChannels();
    });

    this.client.on('channel.updated', (event) => {
      this.loadChannels();
    });
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/channels/delete`,
        { channelId }
      ).toPromise();

      if (response.success) {
        // if the deleted channel was currently selected, clear selection
        if (this.selectedChannelSubject.value?.id === channelId) {
          this.selectedChannelSubject.next(null);
        }
        
        // Reload channels list
        await this.loadChannels();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting channel via backend:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.currentUserSubject.next(null);
  }

  //to check if client is initialized
  isInitialized(): boolean {
    return this.client !== null && this.currentUserSubject.value !== null;
  }

  // to get current user safely
  getCurrentUser(): ChatUser | null {
    return this.currentUserSubject.value;
  }
}

export interface ChatUser {
  id: string;
  name: string;
  role: 'admin' | 'service_center' | 'customer' | 'user';
  image?: string;
}