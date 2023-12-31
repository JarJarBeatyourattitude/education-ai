"use client";

import { Space_Grotesk, Inter, Poppins } from "next/font/google";
import { useEffect, useState } from "react";
import JSON5 from "json5";
import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import {
  CharacterTextSplitter,
  RecursiveCharacterTextSplitter,
  TextSplitter,
} from "langchain/text_splitter";
import { OpenAI, PromptTemplate } from "langchain/dist";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PineconeClient } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { sidebarWidthState } from "@/atoms/sidebar";
import { useRecoilState } from "recoil";
import { BufferMemory } from "langchain/memory";
import { writeFile } from "fs/promises";
import Card from "@/components/Chalks/Card";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import FileInput from "@/components/FileInput";
import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import { Analytics } from '@vercel/analytics/react';


const inter = Inter({ subsets: ["latin"] });
const space_grotesk = Space_Grotesk({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

export default function Home() {
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [isSiteFetching, setIsSiteFetching] = useState<
    number | null | undefined
  >();
  const [notesText, setNotesText] = useState("");
  const [question, setQuestion] = useState("");
  const [answerText, setAnswerText] = useState<any>();
  const [streamedAnswer, setStreamedAnswer] = useState<string>("");
  const [userUrl, setUserUrl] = useState<string>("");
  const [chain, setChain] = useState<any>(null);
  const [sidebarWidth, setSidebarWidth] = useRecoilState(sidebarWidthState);
  const [fileLoading, setFileLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState([
    {
      message: "Hi there! How can I help?",
      type: "apiMessage",
    },
  ]);
  const Chalks = [
    {
      id: 1,
      title: "The Woodlands",
      img: "https://thewoodlandsss.peelschools.org/images/logo.svg",
      description:
        "The Woodlands Secondary School is a school in Mississauga, Ontario, Canada",
      urls: [
        "https://sites.google.com/pdsb.net/twsstudentservices/woodlands-club-hub",
        "https://sites.google.com/pdsb.net/twsstudentservices/home?authuser=0",
        "https://en.wikipedia.org/wiki/The_Woodlands_School_(Mississauga)",
        "https://sites.google.com/pdsb.net/twsstudentservices/important-links-and-info?authuser=0",
      ],
    },
    {
      id: 2,
      title: "John Fraser",
      img: "https://johnfraser.peelschools.org/images/logo.svg",
      description:
        "John Fraser Secondary School is a school in Mississauga, Ontario, Canada",
      urls: [
        "https://johnfrasersac.com/allclubs/",
        "https://en.wikipedia.org/wiki/John_Fraser_Secondary_School",
      ],
    },
    {
      id: 3,
      title: "French League",
      img: "https://www.raycast.com/_next/image?url=https%3A%2F%2Ffiles.raycast.com%2Fp83cp3dpry9ktfemji1dcy4af5jp&w=128&q=75",
      description:
        "France's top football league with 20 clubs competing for the championship",
      urls: [
        "https://www.ligue1.com/ranking",
        "https://www.ligue1.com/ranking/scorers",
        "https://www.ligue1.com/ranking/assists",
        "https://www.ligue1.com/fixtures-results",
      ],
    },
    {
      id: 4,
      title: "Your Chalk",
      img: "https://www.raycast.com/_next/image?url=https%3A%2F%2Ffiles.raycast.com%2Fp83cp3dpry9ktfemji1dcy4af5jp&w=128&q=75",
      description: "Your own Chalk",
      urls: [userUrl],
    },
  ];

  const model = new ChatOpenAI(
    {
      openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      streaming: true,
      modelName: "gpt-3.5-turbo",
      temperature: 0.7,
      topP: 1,
      callbacks: [
        {
          handleLLMStart() {
            setStreaming(true);
          },
          handleLLMNewToken(token: string) {
            setStreamedAnswer((prev) => prev + token);
          },
          handleLLMEnd() {
            setStreaming(false);
          },
        },
      ],
    },
    {
      basePath: process.env.NEXT_PUBLIC_OPENAI_ENDPOINT,
    }
  );

  const CONDENSE_TEMPLATE = `
  Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

  Chat History:
  {chat_history}
  Follow Up Input: {question}
  Standalone question:
`;

  const QA_TEMPLATE = `
  You are ChalkBot, a large language model.
  Carefully heed the user's instructions.
  Respond using lots of Markdown. Make sure to use emojis throughout.

  {context}

  Question: {question}
  Helpful answer in markdown format:
  `;

  const scrapeSite = async (urls: string[]) => {
    const res = await fetch(`/api/extract`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls }),
    });

    const data = await res.json();

    console.log(data);

    return data.extracted_text;
  };

  const getTextChunks = async (ChalkId: number) => {
    const siteText = await scrapeSite(Chalks[ChalkId].urls);

    console.log(siteText);

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });

    const docs = await splitter.createDocuments([siteText as string]);

    console.log(docs);

    return docs;
  };
  const fetchSite = async (ChalkId: number) => {
    console.log('fetchSite called, ChalkId:', ChalkId);
    setIsSiteFetching(ChalkId);
    try {
      const docs = await getTextChunks(ChalkId);
      console.log('getTextChunks completed successfully, docs:', docs);
  
      const vectorStore = await MemoryVectorStore.fromDocuments(
        docs,
        new OpenAIEmbeddings(
          {
            openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
            stripNewLines: true,
            verbose: true,
          },
          {
          basePath: process.env.NEXT_PUBLIC_OPENAI_ENDPOINT,
          }
        )
      );
      console.log('MemoryVectorStore creation completed successfully, vectorStore:', vectorStore);
  
      const conversationalChain = ConversationalRetrievalQAChain.fromLLM(
        model,
        vectorStore.asRetriever(),
        {
          questionGeneratorTemplate: CONDENSE_TEMPLATE,
          qaTemplate: QA_TEMPLATE,
        }
      );
      console.log('ConversationalRetrievalQAChain creation completed successfully, conversationalChain:', conversationalChain);
      
      setChain(conversationalChain);
      console.log("chain set successfully")
    } catch(error) {
      console.error('Error occurred in fetchSite:', error);
    } finally {
      setIsSiteFetching(null);
    }
  };
  
  const handleChatSubmit = async (prompt: string) => {
    setStreamedAnswer("");
    setQuestion(prompt);
    setIsAnswerLoading(true);

    setMessages((prevMessages) => [
      ...prevMessages,
      { message: prompt, type: "userMessage" },
    ]);
    
    let res: any;
    if (chain) {
      res = await chain.call({
        question: prompt,
        chat_history: [],
      });
    } else {
      console.error('Chain is not initialized');
    }
    

    setMessages((prevMessages) => [
      ...prevMessages,
      { message: res.text, type: "apiMessage" },
    ]);

    setIsAnswerLoading(false);
  };

  useEffect(() => {
    if (messages.length >= 3) {
      setHistory([
        [
          messages[messages.length - 2].message,
          messages[messages.length - 1].message,
        ],
      ] as any);
    }
  }, [messages]);

  const handleFileSelected = async (file: File) => {
    setFileLoading(true);

    console.log("Running");
    const loader = new PDFLoader(file);
    console.log("Made PDF");
    const docs = await loader.loadAndSplit();
    console.log("Loaded PDF");
    // const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    // const docs = await splitter.splitDocuments(loadedDocs);

    console.log(docs);

    const vectorStore = await MemoryVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings(
        {
          //openai_api_key: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
          openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,

          stripNewLines: true,
          verbose: true,
        },
        {
          basePath: process.env.NEXT_PUBLIC_OPENAI_ENDPOINT,
        }
      )
    );

    const conversationalChain = ConversationalRetrievalQAChain.fromLLM(
      model,
      vectorStore.asRetriever(),
      {
        questionGeneratorTemplate: CONDENSE_TEMPLATE,
        qaTemplate: QA_TEMPLATE,
      }
    );

    setChain(conversationalChain);

    console.log("DONE 🔥");

    setFileLoading(false);
  };

  return (
    <main>
      <div
        className="flex flex-col w-full items-center justify-center gap-8 h-full"
        style={{
          paddingLeft: sidebarWidth,
        }}
      >
        <div className="items-center pt-12 pb-4 text-5xl select-none inline-flex gap-2 mt-6">
          <span
            className={
              space_grotesk.className + " font-medium text-zinc-700 pb-2"
            }
          >
            ChalkBot
          </span>
          <span className="pb-2">🔥</span>
        </div>
        <div className="w-full px-8 select-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {Chalks.map((Chalk, idx) => (
              <Card
                key={idx}
                Chalk={Chalk}
                fetchSite={fetchSite}
                isSiteFetching={isSiteFetching}
              />
            ))}
          </div>

          <input
            type="text"
            placeholder="URL of the site you want to Chalknite 🔗"
            onChange={(e) => setUserUrl(e.target.value)}
            className="w-full font-normal resize-none mt-8 hover:bg-zinc-50 rounded-md py-3 px-4 shadow-sm outline-none ring-1 ring-zinc-200 hover:ring-2 transition-all duration-300 hover:ring-zinc-300 focus:ring-2 focus:ring-orange-500 placeholder:text-zinc-500/60"
          />
          <div
            className={`mt-4 ${
              fileLoading ? "text-green-500" : "text-orange-500"
            }`}
          >
            <FileInput onFileSelected={handleFileSelected} />
          </div>
        </div>

        <div className="w-full h-full flex flex-col px-8 py-2 pb-24">
          <div className="mb-4 flex justify-start">
            <div className="bg-zinc-100/75 rounded-xl px-4 py-3 text-zinc-700 max-w-xl break-words">
              <span className="prose transition-all duration-300">
                <ReactMarkdown>
                  {"Hi there! Try **Chalkniting** something 🔥"}
                </ReactMarkdown>
              </span>
            </div>
          </div>

          {question.length > 0 ? (
            <div className="mb-4 flex justify-end">
              <div className="bg-orange-100/75 rounded-xl px-4 py-3 text-zinc-700 max-w-xl break-words">
                <span className="prose transition-all duration-300">
                  <ReactMarkdown>{question}</ReactMarkdown>
                </span>
              </div>
            </div>
          ) : null}

          {streamedAnswer.length > 0 ? (
            <div className="mb-4 flex justify-start">
              <div
                className={`bg-zinc-100/75 rounded-xl px-4 py-3 text-zinc-700 max-w-xl break-words transition-all duration-300 ${
                  streaming ? "ring-2 ring-stone-200" : ""
                }`}
              >
                <span className="prose transition-all duration-300">
                  <ReactMarkdown>{streamedAnswer}</ReactMarkdown>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="bottom-6 w-full fixed"
          style={{
            paddingLeft: sidebarWidth / 2,
          }}
        >
          <div className="flex w-full flex-row gap-6 px-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleChatSubmit(notesText);
              }}
              className="flex w-full flex-row gap-3"
            >
              <input
                name=""
                id=""
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="What would you like to Chalknite 🔥"
                className="w-full font-normal select-none resize-none hover:bg-zinc-50 rounded-md py-3 px-4 shadow-sm outline-none ring-1 ring-zinc-200 hover:ring-2 transition-all duration-300 hover:ring-zinc-300 focus:ring-2 focus:ring-orange-500 placeholder:text-zinc-500/60"
              ></input>
              {/* make a black button that says make question */}
              <button
                className="w-max rounded-md select-none outline-none bg-zinc-900 px-8 py-2 font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 active:scale-105 hover:bg-zinc-800 focus:ring focus:ring-orange-500 active:ring active:ring-orange-500"
                type="submit"
                style={{
                  marginRight: sidebarWidth / 2,
                }}
              >
                {isAnswerLoading ? (
                  <span className="inline-flex animate-pulse gap-2">
                    Thinking <p>🧠</p>
                  </span>
                ) : (
                  <span className="inline-flex gap-2">
                    Chalknite <p>🔥</p>
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      <Analytics />
    </main>
  );
}
