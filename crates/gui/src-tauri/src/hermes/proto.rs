use prost::Message;

#[derive(Clone, PartialEq, Eq, Message)]
pub struct Header {
    #[prost(string, tag = "1")]
    pub key: String,
    #[prost(string, tag = "2")]
    pub value: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct Frame {
    #[prost(uint64, tag = "1")]
    pub seq_id: u64,
    #[prost(uint64, tag = "2")]
    pub log_id: u64,
    #[prost(int32, tag = "3")]
    pub service: i32,
    #[prost(int32, tag = "4")]
    pub method: i32,
    #[prost(message, repeated, tag = "5")]
    pub headers: Vec<Header>,
    #[prost(string, optional, tag = "6")]
    pub payload_encoding: Option<String>,
    #[prost(string, optional, tag = "7")]
    pub payload_type: Option<String>,
    #[prost(bytes = "vec", optional, tag = "8")]
    pub payload: Option<Vec<u8>>,
    #[prost(string, optional, tag = "9")]
    pub log_id_new: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_encode_decode_roundtrip() {
        let frame = Frame {
            seq_id: 12345,
            log_id: 67890,
            service: 1,
            method: 1,
            headers: vec![
                Header {
                    key: "type".to_string(),
                    value: "pong".to_string(),
                },
                Header {
                    key: "biz_rt".to_string(),
                    value: "10".to_string(),
                },
            ],
            payload_encoding: Some("gzip".to_string()),
            payload_type: Some("json".to_string()),
            payload: Some(b"{\"code\":200}".to_vec()),
            log_id_new: Some("log_abc_123".to_string()),
        };

        let mut buf = Vec::new();
        frame.encode(&mut buf).expect("encode should succeed");
        assert!(!buf.is_empty());

        let decoded = Frame::decode(&buf[..]).expect("decode should succeed");
        assert_eq!(decoded.seq_id, 12345);
        assert_eq!(decoded.log_id, 67890);
        assert_eq!(decoded.service, 1);
        assert_eq!(decoded.method, 1);
        assert_eq!(decoded.headers.len(), 2);
        assert_eq!(decoded.headers[0].key, "type");
        assert_eq!(decoded.headers[0].value, "pong");
        assert_eq!(decoded.payload, Some(b"{\"code\":200}".to_vec()));
        assert_eq!(decoded.log_id_new, Some("log_abc_123".to_string()));
    }
}
