package main

import (
	"context"
	"errors"

	"github.com/aws/aws-sdk-go-v2/config"
	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

type ClientUtil struct {
	ctx     *context.Context
	clients map[string]*dsql.Client
}

func (clientUtil *ClientUtil) setRegion(region string) func(*dsql.Options) {
	return func(options *dsql.Options) {
		options.Region = region
	}
}

func (clientUtil *ClientUtil) GetInstance(region string) (client *dsql.Client, err error) {

	if clientUtil.clients == nil {
		clientUtil.clients = map[string]*dsql.Client{}
	}

	_, isExists := clientUtil.clients[region]

	if !isExists {
		if clientUtil.ctx == nil {
			ctx := context.Background()
			clientUtil.ctx = &ctx
		}

		cfg, err := config.LoadDefaultConfig(*clientUtil.ctx)
		if err != nil {
			return nil, err
		}

		newClient := dsql.NewFromConfig(cfg, clientUtil.setRegion(region))
		if newClient == nil {
			return nil, errors.New("failed to get a new client")
		}
		clientUtil.clients[region] = newClient
	}

	client = clientUtil.clients[region]

	return
}
