/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package pgadapter

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgproto3"
)

// PostgreSQL protocol constants
const (
	sslRequestCode     = 80877103   // SSL request message code
	startupMessageCode = 196608     // Protocol version 3.0
	cancelRequestCode  = 80877102   // Cancel request message code
	gssEncRequestCode  = 80877104   // GSSAPI encryption request code
)

// clientStartupResult holds the result of parsing a client startup message.
type clientStartupResult struct {
	user     string
	database string
	params   map[string]string
}

// handleConnection handles a single client connection.
func (a *Adapter) handleConnection(ctx context.Context, clientConn net.Conn) {
	defer clientConn.Close()

	remoteAddr := clientConn.RemoteAddr().String()
	a.logger.Debug("new connection", "remote_addr", remoteAddr)

	// Handle client startup handshake
	startup, err := a.handleClientStartup(clientConn)
	if err != nil {
		a.logger.Error("client startup failed", "remote_addr", remoteAddr, "error", err)
		a.sendErrorToClient(clientConn, "08000", "Connection exception", err.Error())
		return
	}

	// Use defaults if not provided
	user := startup.user
	if user == "" {
		user = a.config.defaultUser
	}
	database := startup.database
	if database == "" {
		database = a.config.defaultDatabase
	}

	a.logger.Debug("client startup complete",
		"remote_addr", remoteAddr,
		"user", user,
		"database", database,
	)

	// Connect to DSQL backend
	dsqlConn, err := a.connectToDSQL(ctx, user, database)
	if err != nil {
		a.logger.Error("DSQL connection failed",
			"remote_addr", remoteAddr,
			"error", err,
		)
		a.sendErrorToClient(clientConn, "08006", "Connection failure", err.Error())
		return
	}
	defer dsqlConn.Close()

	a.logger.Debug("DSQL connection established", "remote_addr", remoteAddr)

	// Send authentication success to client
	if err := a.sendAuthSuccessToClient(clientConn); err != nil {
		a.logger.Error("failed to send auth success",
			"remote_addr", remoteAddr,
			"error", err,
		)
		return
	}

	a.logger.Info("connection established",
		"remote_addr", remoteAddr,
		"user", user,
		"database", database,
	)

	// Proxy messages bidirectionally
	a.proxyMessages(ctx, clientConn, dsqlConn)

	a.logger.Debug("connection closed", "remote_addr", remoteAddr)
}

// handleClientStartup reads messages from the client until a valid StartupMessage
// is received. It handles SSLRequest by declining SSL and continuing.
func (a *Adapter) handleClientStartup(conn net.Conn) (*clientStartupResult, error) {
	for {
		// Read message length (4 bytes)
		lenBuf := make([]byte, 4)
		if _, err := io.ReadFull(conn, lenBuf); err != nil {
			return nil, fmt.Errorf("failed to read message length: %w", err)
		}
		msgLen := int(binary.BigEndian.Uint32(lenBuf))

		if msgLen < 4 {
			return nil, fmt.Errorf("invalid message length: %d", msgLen)
		}

		// Read the rest of the message (length includes the 4-byte length field)
		msgBuf := make([]byte, msgLen-4)
		if _, err := io.ReadFull(conn, msgBuf); err != nil {
			return nil, fmt.Errorf("failed to read message body: %w", err)
		}

		// Check message code (first 4 bytes of message body)
		if len(msgBuf) < 4 {
			return nil, fmt.Errorf("message too short: %d bytes", len(msgBuf))
		}
		code := binary.BigEndian.Uint32(msgBuf[:4])

		switch code {
		case sslRequestCode:
			// Decline SSL - respond with 'N'
			if _, err := conn.Write([]byte{'N'}); err != nil {
				return nil, fmt.Errorf("failed to send SSL rejection: %w", err)
			}
			// Continue loop to get actual startup message

		case gssEncRequestCode:
			// Decline GSSAPI encryption - respond with 'N'
			if _, err := conn.Write([]byte{'N'}); err != nil {
				return nil, fmt.Errorf("failed to send GSSAPI rejection: %w", err)
			}
			// Continue loop to get actual startup message

		case cancelRequestCode:
			// Cancel requests are not supported in proxy mode
			return nil, fmt.Errorf("cancel requests are not supported")

		case startupMessageCode:
			// Parse startup message parameters
			return parseStartupParams(msgBuf[4:])

		default:
			return nil, fmt.Errorf("unexpected startup code: %d", code)
		}
	}
}

// parseStartupParams parses the parameter key-value pairs from a StartupMessage.
func parseStartupParams(data []byte) (*clientStartupResult, error) {
	result := &clientStartupResult{
		params: make(map[string]string),
	}

	// Parameters are null-terminated key-value pairs
	i := 0
	for i < len(data) {
		// Find key
		keyEnd := i
		for keyEnd < len(data) && data[keyEnd] != 0 {
			keyEnd++
		}
		if keyEnd >= len(data) {
			break
		}
		key := string(data[i:keyEnd])
		if key == "" {
			// Empty key marks end of parameters
			break
		}

		// Find value
		valueStart := keyEnd + 1
		valueEnd := valueStart
		for valueEnd < len(data) && data[valueEnd] != 0 {
			valueEnd++
		}
		value := ""
		if valueStart < len(data) {
			value = string(data[valueStart:valueEnd])
		}

		result.params[key] = value

		// Extract well-known parameters
		switch key {
		case "user":
			result.user = value
		case "database":
			result.database = value
		}

		i = valueEnd + 1
	}

	return result, nil
}

// connectToDSQL establishes an authenticated connection to the DSQL backend.
func (a *Adapter) connectToDSQL(ctx context.Context, user, database string) (net.Conn, error) {
	// Get IAM authentication token
	token, err := a.tokenCache.GetToken(
		ctx,
		a.config.dsqlEndpoint,
		a.config.region,
		user,
		time.Duration(a.config.tokenDuration),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get authentication token: %w", err)
	}

	// Connect to DSQL endpoint
	addr := net.JoinHostPort(a.config.dsqlEndpoint, strconv.Itoa(a.config.dsqlPort))
	conn, err := net.DialTimeout("tcp", addr, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to DSQL: %w", err)
	}

	// Request SSL upgrade
	sslRequest := make([]byte, 8)
	binary.BigEndian.PutUint32(sslRequest[0:4], 8)           // Message length
	binary.BigEndian.PutUint32(sslRequest[4:8], sslRequestCode)
	if _, err := conn.Write(sslRequest); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to send SSL request: %w", err)
	}

	// Read SSL response
	sslResponse := make([]byte, 1)
	if _, err := io.ReadFull(conn, sslResponse); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to read SSL response: %w", err)
	}

	if sslResponse[0] != 'S' {
		conn.Close()
		return nil, fmt.Errorf("DSQL server does not support SSL (got '%c')", sslResponse[0])
	}

	// Upgrade to TLS
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName: a.config.dsqlEndpoint,
		MinVersion: tls.VersionTLS12,
	})
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("TLS handshake failed: %w", err)
	}

	// Send StartupMessage to DSQL
	if err := sendStartupMessage(tlsConn, user, database); err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("failed to send startup message: %w", err)
	}

	// Handle authentication
	if err := handleDSQLAuth(tlsConn, token); err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("DSQL authentication failed: %w", err)
	}

	return tlsConn, nil
}

// sendStartupMessage sends a PostgreSQL StartupMessage to the backend.
func sendStartupMessage(conn net.Conn, user, database string) error {
	// Build startup message using pgproto3
	startup := &pgproto3.StartupMessage{
		ProtocolVersion: pgproto3.ProtocolVersionNumber,
		Parameters: map[string]string{
			"user":             user,
			"database":         database,
			"application_name": "pgadapter",
		},
	}

	buf, err := startup.Encode(nil)
	if err != nil {
		return fmt.Errorf("failed to encode startup message: %w", err)
	}
	_, err = conn.Write(buf)
	return err
}

// handleDSQLAuth handles the authentication exchange with the DSQL backend.
func handleDSQLAuth(conn net.Conn, token string) error {
	frontend := pgproto3.NewFrontend(conn, conn)

	for {
		msg, err := frontend.Receive()
		if err != nil {
			return fmt.Errorf("failed to receive auth message: %w", err)
		}

		switch m := msg.(type) {
		case *pgproto3.AuthenticationCleartextPassword:
			// Send password (IAM token)
			pwMsg := &pgproto3.PasswordMessage{Password: token}
			buf, err := pwMsg.Encode(nil)
			if err != nil {
				return fmt.Errorf("failed to encode password message: %w", err)
			}
			if _, err := conn.Write(buf); err != nil {
				return fmt.Errorf("failed to send password: %w", err)
			}

		case *pgproto3.AuthenticationOk:
			// Continue to wait for ReadyForQuery

		case *pgproto3.ParameterStatus:
			// Server is sending configuration parameters, continue

		case *pgproto3.BackendKeyData:
			// Server is sending process ID and secret key, continue

		case *pgproto3.ReadyForQuery:
			// Authentication complete, backend is ready
			return nil

		case *pgproto3.ErrorResponse:
			return fmt.Errorf("authentication error: %s: %s", m.Code, m.Message)

		default:
			return fmt.Errorf("unexpected message during auth: %T", msg)
		}
	}
}

// sendAuthSuccessToClient sends authentication success messages to the client.
func (a *Adapter) sendAuthSuccessToClient(conn net.Conn) error {
	var buf []byte
	var err error

	// AuthenticationOk
	authOk := &pgproto3.AuthenticationOk{}
	buf, err = authOk.Encode(buf)
	if err != nil {
		return fmt.Errorf("failed to encode AuthenticationOk: %w", err)
	}

	// ParameterStatus messages (common server parameters)
	params := []struct {
		name, value string
	}{
		{"server_version", "16.0"},
		{"server_encoding", "UTF8"},
		{"client_encoding", "UTF8"},
		{"DateStyle", "ISO, MDY"},
		{"TimeZone", "UTC"},
		{"integer_datetimes", "on"},
		{"standard_conforming_strings", "on"},
	}

	for _, p := range params {
		ps := &pgproto3.ParameterStatus{Name: p.name, Value: p.value}
		buf, err = ps.Encode(buf)
		if err != nil {
			return fmt.Errorf("failed to encode ParameterStatus: %w", err)
		}
	}

	// BackendKeyData (fake process ID and secret key)
	bkd := &pgproto3.BackendKeyData{
		ProcessID: 1,
		SecretKey: 1,
	}
	buf, err = bkd.Encode(buf)
	if err != nil {
		return fmt.Errorf("failed to encode BackendKeyData: %w", err)
	}

	// ReadyForQuery
	rfq := &pgproto3.ReadyForQuery{TxStatus: 'I'}
	buf, err = rfq.Encode(buf)
	if err != nil {
		return fmt.Errorf("failed to encode ReadyForQuery: %w", err)
	}

	_, err = conn.Write(buf)
	return err
}

// sendErrorToClient sends a PostgreSQL ErrorResponse to the client.
func (a *Adapter) sendErrorToClient(conn net.Conn, code, severity, message string) {
	errResp := &pgproto3.ErrorResponse{
		Severity: severity,
		Code:     code,
		Message:  message,
	}
	buf, err := errResp.Encode(nil)
	if err != nil {
		a.logger.Debug("failed to encode error response", "error", err)
		return
	}
	if _, err := conn.Write(buf); err != nil {
		a.logger.Debug("failed to send error response", "error", err)
	}
}

// proxyMessages proxies messages bidirectionally between client and DSQL.
func (a *Adapter) proxyMessages(ctx context.Context, clientConn, dsqlConn net.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)

	// Create a context for coordinating shutdown
	proxyCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Client -> DSQL
	go func() {
		defer wg.Done()
		defer cancel()
		io.Copy(dsqlConn, clientConn)
	}()

	// DSQL -> Client
	go func() {
		defer wg.Done()
		defer cancel()
		io.Copy(clientConn, dsqlConn)
	}()

	// Wait for context cancellation or connection close
	go func() {
		<-proxyCtx.Done()
		clientConn.Close()
		dsqlConn.Close()
	}()

	wg.Wait()
}
