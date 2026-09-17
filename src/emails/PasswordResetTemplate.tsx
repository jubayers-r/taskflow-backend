// emails/
import { Body, Container, Heading, Html, Text } from '@react-email/components';

interface PasswordResetTemplateProps {
  resetToken: string;
}

export const PasswordResetEmailTemplate = ({ resetToken }: PasswordResetTemplateProps) => (
  <Html>
    <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9f9f9', padding: '20px' }}>
      <Container style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px' }}>
        <Heading style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>
          Reset Your Password
        </Heading>
        <Text style={{ fontSize: '14px', color: '#4b5563' }}>
          We received a request to reset your password. Use the reset token below within the next 15
          minutes to set a new password:
        </Text>
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            wordBreak: 'break-all',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            padding: '12px 16px',
            color: '#111827',
          }}
        >
          {resetToken}
        </Text>
        <Text style={{ fontSize: '12px', color: '#9ca3af' }}>
          If you didn&apos;t request this, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);
