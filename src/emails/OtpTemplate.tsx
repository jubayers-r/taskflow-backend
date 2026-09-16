// emails/
import { Body, Container, Heading, Html, Text } from '@react-email/components';

interface OtpTemplateProps {
  code: string;
}

export const OtpEmailTemplate = ({ code }: OtpTemplateProps) => (
  <Html>
    <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9f9f9', padding: '20px' }}>
      <Container style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px' }}>
        <Heading style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>
          Verification Code
        </Heading>
        <Text style={{ fontSize: '14px', color: '#4b5563' }}>
          Use the following 6-digit code to complete your verification:
        </Text>
        <Text
          style={{ fontSize: '32px', fontWeight: 'bold', letterSpacing: '6px', color: '#000000' }}
        >
          {code}
        </Text>
      </Container>
    </Body>
  </Html>
);
